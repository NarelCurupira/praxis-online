-- Práxis Web 0.9.1 — nomes de exibição compactos para as tabelas
-- Execute após a migração da versão 0.9.0.

begin;

alter table public.workspace_members
  add column if not exists display_name text;

comment on column public.workspace_members.display_name is
  'Nome curto, configurável pelo administrador, usado somente em tabelas e filtros compactos.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_members_display_name_length'
      and conrelid = 'public.workspace_members'::regclass
  ) then
    alter table public.workspace_members
      add constraint workspace_members_display_name_length
      check (display_name is null or char_length(trim(display_name)) between 1 and 40);
  end if;
end
$$;

create or replace function public.suggest_member_display_name(full_name text, email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(trim(full_name), '') = '' then split_part(coalesce(email, 'Usuário'), '@', 1)
    when array_length(regexp_split_to_array(trim(full_name), '[[:space:]]+'), 1) = 1 then trim(full_name)
    else split_part(trim(full_name), ' ', 1) || ' ' || regexp_replace(trim(full_name), '^.*[[:space:]]', '')
  end
$$;

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
    coalesce((u.raw_user_meta_data->>'mfa_required')::boolean, false),
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
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id in (
    select workspace_id
    from public.workspace_members
    where user_id = auth.uid() and active
  )
  order by p.full_name
$$;

create or replace function public.update_workspace_member_presentation_v091(
  target_user uuid,
  new_display_name text,
  new_efficiency_access text,
  new_reports_access text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  target_role text;
  normalized_display_name text;
begin
  select workspace_id into ws
  from public.workspace_members
  where user_id = auth.uid() and active and role = 'admin'
  limit 1;

  if ws is null then
    raise exception 'Apenas o administrador pode alterar nomes de exibição e permissões.';
  end if;

  if new_efficiency_access not in ('none', 'own', 'team')
     or new_reports_access not in ('none', 'own', 'team') then
    raise exception 'Escopo inválido.';
  end if;

  select role::text into target_role
  from public.workspace_members
  where workspace_id = ws and user_id = target_user;

  if target_role is null then
    raise exception 'Usuário não encontrado na equipe.';
  end if;

  if new_display_name is not null then
    normalized_display_name := trim(new_display_name);
    if normalized_display_name = '' or char_length(normalized_display_name) > 40 then
      raise exception 'O nome de exibição deve possuir entre 1 e 40 caracteres.';
    end if;

    if exists (
      select 1
      from public.workspace_members
      where workspace_id = ws
        and user_id <> target_user
        and lower(trim(display_name)) = lower(normalized_display_name)
    ) then
      raise exception 'Esse nome de exibição já está sendo usado por outro integrante.';
    end if;
  end if;

  update public.workspace_members
  set
    display_name = case when new_display_name is null then display_name else normalized_display_name end,
    efficiency_access = case
      when target_role in ('admin', 'procurador') then 'team'
      when target_role in ('estagiario', 'consulta') then 'none'
      else new_efficiency_access
    end,
    reports_access = case
      when target_role in ('admin', 'procurador') then 'team'
      when target_role in ('estagiario', 'consulta') then 'none'
      else new_reports_access
    end
  where workspace_id = ws and user_id = target_user;
end
$$;

grant execute on function public.list_current_workspace_members_v091() to authenticated;
grant execute on function public.update_workspace_member_presentation_v091(uuid, text, text, text) to authenticated;

commit;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_members'
  and column_name = 'display_name';
