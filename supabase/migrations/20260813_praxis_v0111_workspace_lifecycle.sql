-- Práxis Online 0.11.1-RC
-- Ciclo de vida de Procuradorias: desativação reversível sem exclusão de dados.
-- Execute integralmente no SQL Editor do Supabase.

begin;

alter table public.workspaces
  add column if not exists active boolean not null default true;

update public.workspaces set active = true where active is null;

create or replace function public.current_praxis_workspace_v01082()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.current_workspace_id
  from public.profiles p
  join public.workspaces w on w.id = p.current_workspace_id and w.active
  where p.id = auth.uid()
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p.current_workspace_id
        and wm.user_id = p.id
        and wm.active
    )
  limit 1
$$;

create or replace function public.current_praxis_role_v01082()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role::text
  from public.profiles p
  join public.workspaces w
    on w.id = p.current_workspace_id
   and w.active
  join public.workspace_members wm
    on wm.workspace_id = p.current_workspace_id
   and wm.user_id = p.id
   and wm.active
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.list_my_workspaces_v01079()
returns table(workspace_id uuid, workspace_name text, role public.praxis_role, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  select wm.workspace_id, w.name, wm.role, wm.workspace_id = p.current_workspace_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id and w.active
  join public.profiles p on p.id = auth.uid()
  where wm.user_id = auth.uid()
    and wm.active
  order by (wm.workspace_id = p.current_workspace_id) desc, w.name collate "C"
$$;

create or replace function public.set_current_workspace_v01079(target_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active
      and w.active
  ) then
    raise exception 'Você não possui acesso ativo a esta Procuradoria ou a unidade está desativada.';
  end if;

  update public.profiles
     set current_workspace_id = target_workspace
   where id = auth.uid();
end
$$;

drop function if exists public.list_admin_workspaces_v01080();

create function public.list_admin_workspaces_v01080()
returns table(
  workspace_id uuid,
  workspace_name text,
  is_current boolean,
  member_count bigint,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.id = p.current_workspace_id,
    count(*) filter (where members.active)::bigint,
    w.active
  from public.workspace_members mine
  join public.workspaces w on w.id = mine.workspace_id
  join public.profiles p on p.id = auth.uid()
  left join public.workspace_members members on members.workspace_id = w.id
  where mine.user_id = auth.uid()
    and mine.active
    and mine.role = 'admin'
  group by w.id, w.name, w.active, p.current_workspace_id
  order by w.active desc, (w.id = p.current_workspace_id) desc, w.name collate "C"
$$;

create or replace function public.set_workspace_active_v0111(
  target_workspace uuid,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_workspace uuid;
  previous_active boolean;
  workspace_name_value text;
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active
      and wm.role = 'admin'
  ) then
    raise exception 'Apenas um administrador vinculado pode alterar o estado desta Procuradoria.';
  end if;

  select p.current_workspace_id
    into current_workspace
    from public.profiles p
   where p.id = auth.uid();

  select w.active, w.name
    into previous_active, workspace_name_value
    from public.workspaces w
   where w.id = target_workspace
   for update;

  if previous_active is null then
    raise exception 'Procuradoria não encontrada.';
  end if;

  if previous_active = new_active then
    return;
  end if;

  if not new_active and current_workspace = target_workspace then
    raise exception 'Troque para outra Procuradoria antes de desativar a unidade atualmente selecionada.';
  end if;

  update public.workspaces
     set active = new_active
   where id = target_workspace;

  if not new_active then
    update public.profiles p
       set current_workspace_id = (
         select wm.workspace_id
           from public.workspace_members wm
           join public.workspaces w on w.id = wm.workspace_id and w.active
          where wm.user_id = p.id
            and wm.active
            and wm.workspace_id <> target_workspace
          order by wm.created_at, wm.workspace_id
          limit 1
       )
     where p.current_workspace_id = target_workspace;
  end if;

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values (
    target_workspace,
    auth.uid(),
    case when new_active then 'workspace_reactivated' else 'workspace_deactivated' end,
    jsonb_build_object(
      'workspace_id', target_workspace,
      'name', workspace_name_value,
      'active', new_active
    )
  );
end
$$;

revoke all on function public.set_workspace_active_v0111(uuid, boolean) from public, anon;
grant execute on function public.set_workspace_active_v0111(uuid, boolean) to authenticated;

create or replace function public.guard_active_workspace_write_v0111()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspaces w
    where w.id = new.workspace_id and w.active
  ) then
    raise exception 'A Procuradoria de destino está desativada.';
  end if;
  return new;
end
$$;

drop trigger if exists cases_guard_active_workspace_v0111 on public.cases;
create trigger cases_guard_active_workspace_v0111
before insert or update of workspace_id on public.cases
for each row execute function public.guard_active_workspace_write_v0111();

drop trigger if exists movements_guard_active_workspace_v0111 on public.movements;
create trigger movements_guard_active_workspace_v0111
before insert or update of workspace_id on public.movements
for each row execute function public.guard_active_workspace_write_v0111();

revoke all on function public.guard_active_workspace_write_v0111() from public, anon;
grant execute on function public.guard_active_workspace_write_v0111() to authenticated;

commit;

select id, name, active
from public.workspaces
order by active desc, name;
