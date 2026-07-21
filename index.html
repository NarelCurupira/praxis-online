-- Práxis Online 0.2.1 — correção do pgcrypto nos convites
-- Execute no SQL Editor após 002-equipe-convites.sql.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_workspace_invite(invited_email text, invited_role public.praxis_role)
returns text language plpgsql security definer set search_path = public
as $$
declare target_workspace uuid; raw_token text;
begin
  select current_workspace_id into target_workspace from public.profiles where id = auth.uid();
  if target_workspace is null or not public.is_workspace_admin(target_workspace) then
    raise exception 'Somente o administrador pode criar convites';
  end if;
  if invited_role = 'admin' then raise exception 'O convite não pode conceder administração'; end if;
  raw_token := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  insert into public.workspace_invites(workspace_id, email, role, token_hash, created_by)
  values (target_workspace, lower(trim(invited_email)), invited_role, encode(extensions.digest(raw_token, 'sha256'), 'hex'), auth.uid());
  return raw_token;
end $$;

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_invite public.workspace_invites%rowtype; authenticated_email text;
begin
  authenticated_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into target_invite from public.workspace_invites
  where token_hash = encode(extensions.digest(upper(trim(invite_token)), 'sha256'), 'hex')
    and accepted_at is null and expires_at > now();
  if target_invite.id is null then raise exception 'Convite inválido ou expirado'; end if;
  if target_invite.email <> authenticated_email then raise exception 'Este convite pertence a outro e-mail'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, active)
  values (target_invite.workspace_id, auth.uid(), target_invite.role, true)
  on conflict (workspace_id, user_id) do update set role = excluded.role, active = true;
  update public.profiles set current_workspace_id = target_invite.workspace_id where id = auth.uid();
  update public.workspace_invites set accepted_at = now() where id = target_invite.id;
  return target_invite.workspace_id;
end $$;
