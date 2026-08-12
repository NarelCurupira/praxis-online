-- Práxis Online 0.10.7.9
-- Preparação segura para múltiplas Procuradorias e isolamento da equipe ativa.
-- Migração idempotente para bancos existentes.

begin;

-- A RPC 0.9.1 passa a devolver exclusivamente os integrantes do
-- profiles.current_workspace_id. A versão anterior aceitava qualquer workspace
-- do qual o usuário fosse membro e poderia misturar equipes quando um usuário
-- estivesse vinculado simultaneamente a duas Procuradorias.
create or replace function public.list_current_workspace_members_v091()
returns table(
  user_id uuid,
  full_name text,
  display_name text,
  email text,
  role public.praxis_role,
  active boolean,
  mfa_required boolean,
  historico_disponivel_desde date,
  efficiency_access text,
  reports_access text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.user_id,
    p.full_name,
    coalesce(nullif(trim(wm.display_name), ''), public.suggest_member_display_name(p.full_name, u.email)),
    coalesce(u.email, ''),
    wm.role,
    wm.active,
    (coalesce(wm.mfa_required, false) or wm.role = 'admin'),
    wm.historico_disponivel_desde,
    case
      when wm.role in ('admin', 'procurador') then 'team'
      when wm.role::text in ('estagiario', 'consulta') then 'none'
      else wm.efficiency_access
    end,
    case
      when wm.role in ('admin', 'procurador') then 'team'
      when wm.role::text in ('estagiario', 'consulta') then 'none'
      else wm.reports_access
    end
  from public.profiles me
  join public.workspace_members wm on wm.workspace_id = me.current_workspace_id
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where me.id = auth.uid()
    and public.is_workspace_member(me.current_workspace_id)
  order by p.full_name collate "C";
$$;

-- Mantém o fallback 0.9.0 com o mesmo isolamento.
create or replace function public.list_current_workspace_members_v09()
returns table(
  user_id uuid,
  full_name text,
  email text,
  role public.praxis_role,
  active boolean,
  mfa_required boolean,
  historico_disponivel_desde date,
  efficiency_access text,
  reports_access text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.user_id,
    p.full_name,
    coalesce(u.email, ''),
    wm.role,
    wm.active,
    (coalesce(wm.mfa_required, false) or wm.role = 'admin'),
    wm.historico_disponivel_desde,
    case
      when wm.role in ('admin', 'procurador') then 'team'
      when wm.role::text in ('estagiario', 'consulta') then 'none'
      else wm.efficiency_access
    end,
    case
      when wm.role in ('admin', 'procurador') then 'team'
      when wm.role::text in ('estagiario', 'consulta') then 'none'
      else wm.reports_access
    end
  from public.profiles me
  join public.workspace_members wm on wm.workspace_id = me.current_workspace_id
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where me.id = auth.uid()
    and public.is_workspace_member(me.current_workspace_id)
  order by p.full_name collate "C";
$$;

-- API preparatória da 0.10.8: lista somente os workspaces em que o usuário
-- possui vínculo ativo. Ainda não existe seletor visual na 0.10.7.9.
create or replace function public.list_my_workspaces_v01079()
returns table(
  workspace_id uuid,
  workspace_name text,
  role public.praxis_role,
  is_current boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.workspace_id,
    w.name,
    wm.role,
    wm.workspace_id = p.current_workspace_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  join public.profiles p on p.id = auth.uid()
  where wm.user_id = auth.uid()
    and wm.active
  order by (wm.workspace_id = p.current_workspace_id) desc, w.name collate "C";
$$;

-- A troca do workspace ativo só é aceita quando o próprio usuário possui
-- vínculo ativo com a unidade de destino. O frontend da 0.10.8 poderá consumir
-- esta função sem ampliar as políticas RLS existentes.
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
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active
  ) then
    raise exception 'Você não possui acesso ativo a esta Procuradoria.';
  end if;

  update public.profiles
     set current_workspace_id = target_workspace
   where id = auth.uid();
end;
$$;

revoke execute on function public.list_my_workspaces_v01079() from public, anon;
revoke execute on function public.set_current_workspace_v01079(uuid) from public, anon;

grant execute on function public.list_current_workspace_members_v091() to authenticated;
grant execute on function public.list_current_workspace_members_v09() to authenticated;
grant execute on function public.list_my_workspaces_v01079() to authenticated;
grant execute on function public.set_current_workspace_v01079(uuid) to authenticated;

commit;
