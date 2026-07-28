-- Práxis Web 0.10.3.4 — passkey reconhecida como autenticação forte no backend
-- Corrige RPCs, políticas RLS e rotinas administrativas que antes aceitavam apenas AAL2/TOTP.
begin;

create or replace function public.praxis_has_strong_auth()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry(value)
      where lower(
        case
          when jsonb_typeof(entry.value) = 'object' then coalesce(entry.value ->> 'method', '')
          when jsonb_typeof(entry.value) = 'string' then trim(both '"' from entry.value::text)
          else ''
        end
      ) in ('passkey', 'webauthn', 'mfa/webauthn')
    );
$$;

revoke all on function public.praxis_has_strong_auth() from public;
grant execute on function public.praxis_has_strong_auth() to authenticated;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.praxis_has_strong_auth()
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace
        and wm.user_id = auth.uid()
        and wm.active
        and wm.role = 'admin'
    );
$$;

revoke all on function public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

-- Recria explicitamente as rotinas da tela para que todas usem a regra corrigida.
create or replace function public.list_technical_errors_v0101(result_limit integer default 100)
returns table(
  id bigint,
  error_code text,
  error_message text,
  page_name text,
  error_source text,
  app_version text,
  build_commit text,
  browser_info text,
  occurred_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select te.id, te.error_code, te.error_message, te.page_name, te.error_source,
         te.app_version, te.build_commit, te.browser_info, te.occurred_at, te.created_at
  from public.technical_errors te
  where public.is_workspace_admin(te.workspace_id)
  order by te.created_at desc
  limit least(greatest(coalesce(result_limit, 100), 1), 500);
$$;

grant execute on function public.list_technical_errors_v0101(integer) to authenticated;

create or replace function public.get_praxis_diagnostics_v0102()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w uuid;
  wname text;
  result jsonb;
begin
  select wm.workspace_id, ws.name
    into w, wname
  from public.workspace_members wm
  join public.workspaces ws on ws.id = wm.workspace_id
  where wm.user_id = auth.uid()
    and wm.active
    and wm.role = 'admin'
    and public.is_workspace_admin(wm.workspace_id)
  limit 1;

  if w is null then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;

  perform public.archive_old_performance_metrics_v0102();

  select jsonb_build_object(
    'workspace_name', wname,
    'processes', (select count(*) from public.cases c where c.workspace_id = w),
    'movements', (select count(*) from public.movements m where m.workspace_id = w and m.deleted_at is null),
    'active_users', (select count(*) from public.workspace_members wm where wm.workspace_id = w and wm.active),
    'imprecise_received', (select count(*) from public.movements m where m.workspace_id = w and m.deleted_at is null and not m.received_time_precise),
    'imprecise_sent', (select count(*) from public.movements m where m.workspace_id = w and m.deleted_at is null and m.sent_at is not null and not m.sent_time_precise),
    'technical_errors', (select count(*) from public.technical_errors te where te.workspace_id = w),
    'slow_operations', (select count(*) from public.technical_performance tp where tp.workspace_id = w and tp.archived_at is null),
    'archived_slow_operations', (select count(*) from public.technical_performance tp where tp.workspace_id = w and tp.archived_at is not null),
    'import_batches', (select count(*) from public.import_batches ib where ib.workspace_id = w),
    'database_bytes', pg_database_size(current_database()),
    'database_pretty', pg_size_pretty(pg_database_size(current_database())),
    'checked_at', now()
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_praxis_diagnostics_v0102() to authenticated;

commit;
