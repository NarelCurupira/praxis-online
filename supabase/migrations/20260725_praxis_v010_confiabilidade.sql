-- Práxis Web 0.10.0 — registro técnico seguro de erros
-- Execute integralmente no SQL Editor antes de publicar o frontend 0.10.0.

begin;

create table if not exists public.technical_errors (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  user_id uuid,
  error_code text not null,
  error_message text not null,
  error_stack text not null default '',
  component_stack text not null default '',
  page_name text not null default '',
  error_source text not null default '',
  app_version text not null default '',
  build_commit text not null default '',
  browser_info text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists technical_errors_code_uidx on public.technical_errors(error_code);
create index if not exists technical_errors_workspace_created_idx on public.technical_errors(workspace_id, created_at desc);

alter table public.technical_errors enable row level security;
revoke all on public.technical_errors from public;
grant select on public.technical_errors to authenticated;

drop policy if exists technical_errors_admin_read on public.technical_errors;
create policy technical_errors_admin_read
on public.technical_errors
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = technical_errors.workspace_id
      and wm.user_id = auth.uid()
      and wm.active = true
      and wm.role = 'admin'
  )
);

create or replace function public.log_technical_error_v010(
  error_code text,
  error_message text,
  error_stack text default '',
  component_stack text default '',
  page_name text default '',
  error_source text default '',
  app_version text default '',
  build_commit text default '',
  browser_info text default '',
  occurred_at_value timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace uuid;
begin
  select wm.workspace_id into target_workspace
  from public.workspace_members wm
  where wm.user_id = auth.uid() and wm.active = true
  limit 1;

  if target_workspace is null then
    return;
  end if;

  insert into public.technical_errors (
    workspace_id, user_id, error_code, error_message, error_stack,
    component_stack, page_name, error_source, app_version, build_commit,
    browser_info, occurred_at
  ) values (
    target_workspace, auth.uid(), left(error_code, 80), left(error_message, 1000),
    left(error_stack, 6000), left(component_stack, 6000), left(page_name, 120),
    left(error_source, 120), left(app_version, 40), left(build_commit, 80),
    left(browser_info, 500), coalesce(occurred_at_value, now())
  ) on conflict (error_code) do nothing;
end;
$$;

revoke all on function public.log_technical_error_v010(text,text,text,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.log_technical_error_v010(text,text,text,text,text,text,text,text,text,timestamptz) to authenticated;

commit;
