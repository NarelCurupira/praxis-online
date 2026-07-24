-- Práxis Web 0.8.0 — cadastro administrativo e cobertura histórica
-- Execute uma única vez após 009-relatorios-gerenciais.sql.
-- A data de cobertura permanece nula até confirmação expressa do administrador.

alter table public.workspace_members
  add column if not exists historico_disponivel_desde date;

comment on column public.workspace_members.historico_disponivel_desde is
  'Data confirmada pelo administrador a partir da qual o histórico do usuário é considerado completo. Não inferir automaticamente.';

-- O cadastro por código deixa de ser uma porta de entrada da aplicação.
-- As tabelas e registros antigos são preservados para auditoria.
revoke execute on function public.create_workspace_invite(text, public.praxis_role) from authenticated;
revoke execute on function public.accept_workspace_invite(text) from authenticated;
revoke execute on function public.validate_workspace_invite(text, text) from anon, authenticated;

drop function if exists public.list_current_workspace_members();
create function public.list_current_workspace_members()
returns table(
  user_id uuid,
  full_name text,
  email text,
  role public.praxis_role,
  active boolean,
  mfa_required boolean,
  historico_disponivel_desde date
)
language sql stable security definer set search_path = public
as $$
  select wm.user_id, p.full_name::text, coalesce(u.email, '')::text,
    wm.role, wm.active, (wm.mfa_required or wm.role = 'admin'),
    wm.historico_disponivel_desde
  from public.profiles me
  join public.workspace_members wm on wm.workspace_id = me.current_workspace_id
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where me.id = auth.uid() and public.is_workspace_member(me.current_workspace_id)
  order by p.full_name collate "C";
$$;

grant execute on function public.list_current_workspace_members() to authenticated;

drop function if exists public.update_workspace_member_profile(uuid, text, public.praxis_role, boolean, boolean);
create function public.update_workspace_member_profile(
  target_user uuid,
  new_full_name text,
  new_role public.praxis_role,
  new_active boolean,
  new_mfa_required boolean,
  new_historico_disponivel_desde date
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
        mfa_required = case when new_role = 'admin' then true else new_mfa_required end,
        historico_disponivel_desde = new_historico_disponivel_desde
    where workspace_id = target_workspace and user_id = target_user;

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values (target_workspace, auth.uid(), 'member_profile_updated', jsonb_build_object(
    'target_user', target_user,
    'role', new_role,
    'active', new_active,
    'mfa_required', case when new_role = 'admin' then true else new_mfa_required end,
    'historico_disponivel_desde', new_historico_disponivel_desde
  ));
end $$;

grant execute on function public.update_workspace_member_profile(
  uuid, text, public.praxis_role, boolean, boolean, date
) to authenticated;

