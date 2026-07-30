-- Práxis Online 0.2.0 — equipe, convites e espaço atual
-- Execute após schema.sql no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists current_workspace_id uuid references public.workspaces(id) on delete set null;

update public.profiles p
set current_workspace_id = (
  select wm.workspace_id from public.workspace_members wm
  where wm.user_id = p.id and wm.active
  order by wm.created_at limit 1
)
where p.current_workspace_id is null;

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.praxis_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.workspace_invites enable row level security;

drop policy if exists invites_select_admin on public.workspace_invites;
create policy invites_select_admin on public.workspace_invites for select
using (public.is_workspace_admin(workspace_id));

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

create or replace function public.list_current_workspace_members()
returns table(user_id uuid, full_name text, email text, role public.praxis_role, active boolean)
language sql stable security definer set search_path = public
as $$
  select wm.user_id, p.full_name, coalesce(u.email, ''), wm.role, wm.active
  from public.profiles me
  join public.workspace_members wm on wm.workspace_id = me.current_workspace_id
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where me.id = auth.uid() and public.is_workspace_member(me.current_workspace_id)
  order by case wm.role when 'admin' then 0 when 'procurador' then 1 when 'assessor' then 2 else 3 end, p.full_name;
$$;

create or replace function public.update_workspace_member(target_user uuid, new_role public.praxis_role, new_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare target_workspace uuid;
begin
  select current_workspace_id into target_workspace from public.profiles where id = auth.uid();
  if not public.is_workspace_admin(target_workspace) then raise exception 'Acesso negado'; end if;
  if target_user = auth.uid() then raise exception 'O administrador não pode alterar o próprio acesso'; end if;
  if new_role = 'admin' then raise exception 'A promoção para administrador exige procedimento específico'; end if;
  update public.workspace_members set role = new_role, active = new_active
  where workspace_id = target_workspace and user_id = target_user;
end $$;

create or replace function public.handle_new_praxis_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare new_workspace uuid;
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  insert into public.workspaces(name, created_by)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)) || ' — Práxis', new.id)
  returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace, new.id, 'admin');
  update public.profiles set current_workspace_id = new_workspace where id = new.id;
  insert into public.class_settings(workspace_id, name, business_days) values
    (new_workspace, 'Apelação Cível', 30), (new_workspace, 'Agravo de Instrumento', 30),
    (new_workspace, 'Agravo Interno', 30), (new_workspace, 'Remessa Necessária', 30),
    (new_workspace, 'Mandado de Segurança', 5), (new_workspace, 'Conflito Negativo de Competência', 5),
    (new_workspace, 'Conflito de Competência', 5), (new_workspace, 'Recurso Especial', 30),
    (new_workspace, 'Recurso Extraordinário', 30), (new_workspace, 'Outro', 30);
  return new;
end $$;
