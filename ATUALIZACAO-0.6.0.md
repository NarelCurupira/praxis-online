-- Práxis Online 0.6.0 — gestão de usuários, MFA configurável e correção da auditoria
-- Execute uma única vez após 006-seguranca-auditoria-eficiencia.sql.

alter table public.workspace_members
  add column if not exists mfa_required boolean not null default false;

update public.workspace_members set mfa_required = true where role = 'admin';

-- O e-mail de auth.users é varchar; o cast explícito corrige
-- "structure of query does not match function result type".
create or replace function public.list_admin_audit()
returns table(id bigint, created_at timestamptz, event_type text, actor_name text, actor_email text, details jsonb)
language plpgsql stable security definer set search_path = public
as $$
declare target_workspace uuid;
begin
  select current_workspace_id into target_workspace from public.profiles where profiles.id = auth.uid();
  if target_workspace is null or not public.is_workspace_admin(target_workspace) then raise exception 'Acesso administrativo e segundo fator necessários'; end if;
  return query
    select a.id::bigint, a.created_at::timestamptz, a.event_type::text,
      coalesce(p.full_name, '')::text, coalesce(u.email, '')::text, a.details::jsonb
    from public.admin_audit_log a
    left join public.profiles p on p.id = a.actor_id
    left join auth.users u on u.id = a.actor_id
    where a.workspace_id = target_workspace
    order by a.created_at desc limit 500;
end $$;

drop function if exists public.list_current_workspace_members();
create function public.list_current_workspace_members()
returns table(user_id uuid, full_name text, email text, role public.praxis_role, active boolean, mfa_required boolean)
language sql stable security definer set search_path = public
as $$
  select wm.user_id, p.full_name::text, coalesce(u.email, '')::text,
    wm.role, wm.active, (wm.mfa_required or wm.role = 'admin')
  from public.profiles me
  join public.workspace_members wm on wm.workspace_id = me.current_workspace_id
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where me.id = auth.uid() and public.is_workspace_member(me.current_workspace_id)
  order by case wm.role when 'admin' then 0 when 'procurador' then 1 when 'assessor' then 2 else 3 end, p.full_name;
$$;

grant execute on function public.list_current_workspace_members() to authenticated;

create or replace function public.update_workspace_member_profile(
  target_user uuid,
  new_full_name text,
  new_role public.praxis_role,
  new_active boolean,
  new_mfa_required boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_workspace uuid;
  previous_role public.praxis_role;
begin
  select current_workspace_id into target_workspace from public.profiles where id = auth.uid();
  if target_workspace is null or not public.is_workspace_admin(target_workspace) then
    raise exception 'Acesso administrativo e segundo fator necessários';
  end if;
  select role into previous_role from public.workspace_members
    where workspace_id = target_workspace and user_id = target_user;
  if previous_role is null then raise exception 'Usuário não pertence a este espaço'; end if;
  if trim(coalesce(new_full_name, '')) = '' then raise exception 'Informe o nome do usuário'; end if;
  if previous_role = 'admin' and (new_role <> 'admin' or not new_active) then
    raise exception 'O acesso do administrador não pode ser removido por esta tela';
  end if;
  if previous_role <> 'admin' and new_role = 'admin' then
    raise exception 'A promoção para administrador exige procedimento específico';
  end if;
  if target_user = auth.uid() and (new_role <> previous_role or not new_active) then
    raise exception 'O administrador não pode alterar o próprio perfil de acesso';
  end if;

  update public.profiles set full_name = trim(new_full_name) where id = target_user;
  update public.workspace_members
    set role = new_role,
        active = new_active,
        mfa_required = case when new_role = 'admin' then true else new_mfa_required end
    where workspace_id = target_workspace and user_id = target_user;

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values (target_workspace, auth.uid(), 'member_profile_updated', jsonb_build_object(
    'target_user', target_user, 'role', new_role, 'active', new_active,
    'mfa_required', case when new_role = 'admin' then true else new_mfa_required end
  ));
end $$;

grant execute on function public.update_workspace_member_profile(uuid, text, public.praxis_role, boolean, boolean) to authenticated;

comment on column public.workspace_members.mfa_required is 'Exige AAL2 no Práxis; administradores são sempre obrigatórios.';

