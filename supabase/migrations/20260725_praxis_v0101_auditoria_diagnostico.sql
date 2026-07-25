-- Práxis Web 0.10.1 — Auditoria, diagnóstico, logs e desempenho
begin;

create table if not exists public.technical_performance (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  operation_name text not null,
  page_name text not null default '',
  duration_ms integer not null,
  app_version text not null default '',
  build_commit text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists technical_performance_workspace_created_idx on public.technical_performance(workspace_id,created_at desc);
alter table public.technical_performance enable row level security;
revoke all on public.technical_performance from public;
grant select on public.technical_performance to authenticated;
drop policy if exists technical_performance_admin_read on public.technical_performance;
create policy technical_performance_admin_read on public.technical_performance for select to authenticated using (public.is_workspace_admin(workspace_id));

create or replace function public.log_performance_metric_v0101(operation_name_value text,page_name_value text,duration_ms_value integer,app_version_value text default '',build_commit_value text default '') returns void language plpgsql security definer set search_path=public as $$
declare target_workspace uuid;
begin
  select workspace_id into target_workspace from public.workspace_members where user_id=auth.uid() and active limit 1;
  if target_workspace is null or coalesce(duration_ms_value,0)<2000 then return; end if;
  insert into public.technical_performance(workspace_id,user_id,operation_name,page_name,duration_ms,app_version,build_commit)
  values(target_workspace,auth.uid(),left(operation_name_value,120),left(page_name_value,120),duration_ms_value,left(app_version_value,40),left(build_commit_value,80));
end;$$;
revoke all on function public.log_performance_metric_v0101(text,text,integer,text,text) from public;
grant execute on function public.log_performance_metric_v0101(text,text,integer,text,text) to authenticated;

create or replace function public.list_technical_errors_v0101(result_limit integer default 100)
returns table(id bigint,error_code text,error_message text,page_name text,error_source text,app_version text,build_commit text,browser_info text,occurred_at timestamptz,created_at timestamptz)
language sql security definer set search_path=public as $$
  select te.id,te.error_code,te.error_message,te.page_name,te.error_source,te.app_version,te.build_commit,te.browser_info,te.occurred_at,te.created_at
  from public.technical_errors te where public.is_workspace_admin(te.workspace_id)
  order by te.created_at desc limit least(greatest(coalesce(result_limit,100),1),500);
$$;
grant execute on function public.list_technical_errors_v0101(integer) to authenticated;

create or replace function public.list_performance_metrics_v0101(result_limit integer default 100)
returns table(id bigint,operation_name text,page_name text,duration_ms integer,occurred_at timestamptz)
language sql security definer set search_path=public as $$
  select tp.id,tp.operation_name,tp.page_name,tp.duration_ms,tp.occurred_at
  from public.technical_performance tp where public.is_workspace_admin(tp.workspace_id)
  order by tp.created_at desc limit least(greatest(coalesce(result_limit,100),1),500);
$$;
grant execute on function public.list_performance_metrics_v0101(integer) to authenticated;

create or replace function public.get_praxis_diagnostics_v0101() returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid; wname text; result jsonb;
begin
  select wm.workspace_id,ws.name into w,wname from public.workspace_members wm join public.workspaces ws on ws.id=wm.workspace_id where wm.user_id=auth.uid() and wm.active and wm.role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  select jsonb_build_object(
    'workspace_name',wname,
    'processes',(select count(*) from public.cases c where c.workspace_id=w),
    'movements',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null),
    'active_users',(select count(*) from public.workspace_members wm where wm.workspace_id=w and wm.active),
    'imprecise_received',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null and not m.received_time_precise),
    'imprecise_sent',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null and m.sent_at is not null and not m.sent_time_precise),
    'technical_errors',(select count(*) from public.technical_errors te where te.workspace_id=w),
    'slow_operations',(select count(*) from public.technical_performance tp where tp.workspace_id=w),
    'database_bytes',pg_database_size(current_database()),
    'database_pretty',pg_size_pretty(pg_database_size(current_database())),
    'checked_at',now()
  ) into result;
  return result;
end;$$;
grant execute on function public.get_praxis_diagnostics_v0101() to authenticated;

commit;
