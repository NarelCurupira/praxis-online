-- Práxis Web 0.10.2 — desempenho, arquivamento técnico e Importação Inteligente
begin;

-- ---------------------------------------------------------------------------
-- Operações lentas: arquivamento sem exclusão e preferências técnicas
-- ---------------------------------------------------------------------------
alter table public.technical_performance add column if not exists archived_at timestamptz;
create index if not exists technical_performance_workspace_active_idx
  on public.technical_performance(workspace_id, created_at desc) where archived_at is null;

create table if not exists public.workspace_technical_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  slow_operation_threshold_ms integer not null default 2000 check (slow_operation_threshold_ms between 500 and 10000),
  performance_retention_days integer not null default 30 check (performance_retention_days between 7 and 365),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.workspace_technical_settings enable row level security;
revoke all on public.workspace_technical_settings from public;
grant select,insert,update on public.workspace_technical_settings to authenticated;
drop policy if exists technical_settings_admin_access on public.workspace_technical_settings;
create policy technical_settings_admin_access on public.workspace_technical_settings
  for all to authenticated using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create or replace function public.get_technical_settings_v0102()
returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid; result jsonb;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active and role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  insert into public.workspace_technical_settings(workspace_id) values(w) on conflict(workspace_id) do nothing;
  select jsonb_build_object(
    'slow_operation_threshold_ms',slow_operation_threshold_ms,
    'performance_retention_days',performance_retention_days
  ) into result from public.workspace_technical_settings where workspace_id=w;
  return result;
end;$$;
grant execute on function public.get_technical_settings_v0102() to authenticated;

create or replace function public.save_technical_settings_v0102(threshold_ms_value integer,retention_days_value integer)
returns void language plpgsql security definer set search_path=public as $$
declare w uuid;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active and role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  insert into public.workspace_technical_settings(workspace_id,slow_operation_threshold_ms,performance_retention_days,updated_by,updated_at)
  values(w,greatest(500,least(10000,threshold_ms_value)),greatest(7,least(365,retention_days_value)),auth.uid(),now())
  on conflict(workspace_id) do update set
    slow_operation_threshold_ms=excluded.slow_operation_threshold_ms,
    performance_retention_days=excluded.performance_retention_days,
    updated_by=auth.uid(),updated_at=now();
  perform public.record_admin_audit('technical_settings_changed',jsonb_build_object('threshold_ms',threshold_ms_value,'retention_days',retention_days_value));
end;$$;
grant execute on function public.save_technical_settings_v0102(integer,integer) to authenticated;

create or replace function public.log_performance_metric_v0102(
  operation_name_value text,page_name_value text,duration_ms_value integer,
  app_version_value text default '',build_commit_value text default ''
) returns void language plpgsql security definer set search_path=public as $$
declare w uuid; threshold_value integer:=2000;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active limit 1;
  if w is null then return; end if;
  select slow_operation_threshold_ms into threshold_value from public.workspace_technical_settings where workspace_id=w;
  threshold_value:=coalesce(threshold_value,2000);
  if coalesce(duration_ms_value,0)<threshold_value then return; end if;
  insert into public.technical_performance(workspace_id,user_id,operation_name,page_name,duration_ms,app_version,build_commit)
  values(w,auth.uid(),left(operation_name_value,120),left(page_name_value,120),duration_ms_value,left(app_version_value,40),left(build_commit_value,80));
end;$$;
grant execute on function public.log_performance_metric_v0102(text,text,integer,text,text) to authenticated;

create or replace function public.list_performance_metrics_v0102(result_limit integer default 100,include_archived boolean default false)
returns table(id bigint,operation_name text,page_name text,duration_ms integer,occurred_at timestamptz,archived_at timestamptz)
language sql security definer set search_path=public as $$
  select tp.id,tp.operation_name,tp.page_name,tp.duration_ms,tp.occurred_at,tp.archived_at
  from public.technical_performance tp
  where public.is_workspace_admin(tp.workspace_id)
    and (include_archived or tp.archived_at is null)
  order by tp.created_at desc
  limit least(greatest(coalesce(result_limit,100),1),1000);
$$;
grant execute on function public.list_performance_metrics_v0102(integer,boolean) to authenticated;

create or replace function public.archive_performance_metrics_v0102()
returns integer language plpgsql security definer set search_path=public as $$
declare w uuid; affected integer;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active and role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  update public.technical_performance set archived_at=now() where workspace_id=w and archived_at is null;
  get diagnostics affected=row_count;
  perform public.record_admin_audit('performance_metrics_archived',jsonb_build_object('records',affected));
  return affected;
end;$$;
grant execute on function public.archive_performance_metrics_v0102() to authenticated;

create or replace function public.archive_old_performance_metrics_v0102()
returns integer language plpgsql security definer set search_path=public as $$
declare w uuid; retention integer:=30; affected integer;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active and role='admin' limit 1;
  if w is null then return 0; end if;
  select performance_retention_days into retention from public.workspace_technical_settings where workspace_id=w;
  retention:=coalesce(retention,30);
  update public.technical_performance set archived_at=now()
    where workspace_id=w and archived_at is null and created_at<now()-make_interval(days=>retention);
  get diagnostics affected=row_count;
  return affected;
end;$$;
grant execute on function public.archive_old_performance_metrics_v0102() to authenticated;

-- ---------------------------------------------------------------------------
-- Importação Inteligente: lotes, proveniência e reversão segura
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  batch_code text not null default '',
  file_name text not null,
  template_name text not null default '',
  status text not null default 'processing' check(status in ('processing','completed','failed','reverted')),
  rules jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  source_records jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(id)
);
create index if not exists import_batches_workspace_started_idx on public.import_batches(workspace_id,started_at desc);
alter table public.import_batches enable row level security;
revoke all on public.import_batches from public;
grant select,insert,update on public.import_batches to authenticated;
grant usage,select on sequence public.import_batches_id_seq to authenticated;
drop policy if exists import_batches_admin_access on public.import_batches;
create policy import_batches_admin_access on public.import_batches for all to authenticated
  using(public.is_workspace_admin(workspace_id)) with check(public.is_workspace_admin(workspace_id));

create table if not exists public.import_batch_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id bigint not null references public.import_batches(id) on delete cascade,
  entity_type text not null check(entity_type in ('case','movement')),
  entity_id bigint not null,
  before_data jsonb,
  after_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id,entity_type,entity_id)
);
create index if not exists import_snapshots_batch_idx on public.import_batch_snapshots(batch_id,entity_type);
alter table public.import_batch_snapshots enable row level security;
revoke all on public.import_batch_snapshots from public;
grant select,insert,update on public.import_batch_snapshots to authenticated;
grant usage,select on sequence public.import_batch_snapshots_id_seq to authenticated;
drop policy if exists import_snapshots_admin_access on public.import_batch_snapshots;
create policy import_snapshots_admin_access on public.import_batch_snapshots for all to authenticated
  using(public.is_workspace_admin(workspace_id)) with check(public.is_workspace_admin(workspace_id));

alter table public.cases add column if not exists data_origin text not null default 'manual';
alter table public.cases add column if not exists source_batch_id bigint;
alter table public.cases add column if not exists source_file_name text not null default '';
alter table public.cases add column if not exists imported_at timestamptz;
alter table public.movements add column if not exists data_origin text not null default 'manual';
alter table public.movements add column if not exists source_batch_id bigint;
alter table public.movements add column if not exists source_file_name text not null default '';
alter table public.movements add column if not exists imported_at timestamptz;
alter table public.movements add column if not exists received_origin text not null default 'manual';
alter table public.movements add column if not exists sent_origin text not null default 'manual';

do $$ begin
  alter table public.cases add constraint cases_source_batch_id_fkey foreign key(source_batch_id) references public.import_batches(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.movements add constraint movements_source_batch_id_fkey foreign key(source_batch_id) references public.import_batches(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.revert_import_batch_v0102(target_batch_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  w uuid; batch_record public.import_batches%rowtype; snap record; current_updated timestamptz;
  restored_movements integer:=0; deleted_movements integer:=0; restored_cases integer:=0; deleted_cases integer:=0; skipped integer:=0;
begin
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active and role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  select * into batch_record from public.import_batches where id=target_batch_id and workspace_id=w for update;
  if batch_record.id is null then raise exception 'Lote não encontrado.'; end if;
  if batch_record.status<>'completed' then raise exception 'Somente lotes concluídos podem ser desfeitos.'; end if;

  for snap in select * from public.import_batch_snapshots where batch_id=target_batch_id and entity_type='movement' order by id desc loop
    select updated_at into current_updated from public.movements where id=snap.entity_id and workspace_id=w;
    if snap.before_data is null then
      if current_updated is null then continue; end if;
      if current_updated is distinct from snap.after_updated_at then skipped:=skipped+1; continue; end if;
      delete from public.movements where id=snap.entity_id and workspace_id=w;
      deleted_movements:=deleted_movements+1;
    else
      if current_updated is null or current_updated is distinct from snap.after_updated_at then skipped:=skipped+1; continue; end if;
      update public.movements set
        case_id=(snap.before_data->>'case_id')::bigint,
        received_at=(snap.before_data->>'received_at')::timestamptz,
        received_time_precise=coalesce((snap.before_data->>'received_time_precise')::boolean,false),
        deadline_at=nullif(snap.before_data->>'deadline_at','')::date,
        draft_status=coalesce(snap.before_data->>'draft_status','Pendente'),
        workflow_status=(snap.before_data->>'workflow_status'),
        sent_at=nullif(snap.before_data->>'sent_at','')::timestamptz,
        sent_time_precise=coalesce((snap.before_data->>'sent_time_precise')::boolean,false),
        action_type=coalesce(snap.before_data->>'action_type',''),
        notes=coalesce(snap.before_data->>'notes',''),
        priority=coalesce(snap.before_data->>'priority','Normal'),
        document_path=coalesce(snap.before_data->>'document_path',''),
        elapsed_hours=nullif(snap.before_data->>'elapsed_hours','')::numeric,
        assigned_to=nullif(snap.before_data->>'assigned_to','')::uuid,
        deleted_at=nullif(snap.before_data->>'deleted_at','')::timestamptz,
        data_origin=coalesce(snap.before_data->>'data_origin','manual'),
        source_batch_id=nullif(snap.before_data->>'source_batch_id','')::bigint,
        source_file_name=coalesce(snap.before_data->>'source_file_name',''),
        imported_at=nullif(snap.before_data->>'imported_at','')::timestamptz,
        received_origin=coalesce(snap.before_data->>'received_origin','manual'),
        sent_origin=coalesce(snap.before_data->>'sent_origin','manual'),
        updated_by=auth.uid(),updated_at=now()
      where id=snap.entity_id and workspace_id=w;
      restored_movements:=restored_movements+1;
    end if;
  end loop;

  for snap in select * from public.import_batch_snapshots where batch_id=target_batch_id and entity_type='case' order by id desc loop
    select updated_at into current_updated from public.cases where id=snap.entity_id and workspace_id=w;
    if snap.before_data is null then
      if current_updated is null then continue; end if;
      if current_updated is distinct from snap.after_updated_at or exists(select 1 from public.movements where case_id=snap.entity_id) then skipped:=skipped+1; continue; end if;
      delete from public.cases where id=snap.entity_id and workspace_id=w;
      deleted_cases:=deleted_cases+1;
    else
      if current_updated is null or current_updated is distinct from snap.after_updated_at then skipped:=skipped+1; continue; end if;
      update public.cases set
        mp_number=coalesce(snap.before_data->>'mp_number',''),
        judicial_number=coalesce(snap.before_data->>'judicial_number',''),
        class_name=coalesce(snap.before_data->>'class_name',''),
        subject=coalesce(snap.before_data->>'subject',''),
        socially_relevant=coalesce((snap.before_data->>'socially_relevant')::boolean,false),
        extremely_complex=coalesce((snap.before_data->>'extremely_complex')::boolean,false),
        social_theme=coalesce(snap.before_data->>'social_theme',''),
        relevance_reason=coalesce(snap.before_data->>'relevance_reason',''),
        fundamental_right=coalesce(snap.before_data->>'fundamental_right',''),
        affected_group=coalesce(snap.before_data->>'affected_group',''),
        reach=coalesce(snap.before_data->>'reach',''),
        territorial_scope=coalesce(snap.before_data->>'territorial_scope',''),
        impact_type=coalesce(snap.before_data->>'impact_type',''),
        social_result=coalesce(snap.before_data->>'social_result',''),
        sdgs=coalesce(array(select jsonb_array_elements_text(snap.before_data->'sdgs')),'{}'::text[]),
        complexity_reason=coalesce(snap.before_data->>'complexity_reason',''),
        data_origin=coalesce(snap.before_data->>'data_origin','manual'),
        source_batch_id=nullif(snap.before_data->>'source_batch_id','')::bigint,
        source_file_name=coalesce(snap.before_data->>'source_file_name',''),
        imported_at=nullif(snap.before_data->>'imported_at','')::timestamptz,
        updated_by=auth.uid(),updated_at=now()
      where id=snap.entity_id and workspace_id=w;
      restored_cases:=restored_cases+1;
    end if;
  end loop;

  update public.import_batches set status='reverted',reverted_at=now(),reverted_by=auth.uid() where id=target_batch_id;
  perform public.record_admin_audit('import_batch_reverted',jsonb_build_object(
    'batch_id',target_batch_id,'batch_code',batch_record.batch_code,'restored_movements',restored_movements,
    'deleted_movements',deleted_movements,'restored_cases',restored_cases,'deleted_cases',deleted_cases,'skipped',skipped));
  return jsonb_build_object('restored_movements',restored_movements,'deleted_movements',deleted_movements,
    'restored_cases',restored_cases,'deleted_cases',deleted_cases,'skipped',skipped);
end;$$;
grant execute on function public.revert_import_batch_v0102(bigint) to authenticated;

-- Diagnóstico atualizado: somente operações lentas ainda não arquivadas.
create or replace function public.get_praxis_diagnostics_v0102() returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid; wname text; result jsonb;
begin
  select wm.workspace_id,ws.name into w,wname from public.workspace_members wm join public.workspaces ws on ws.id=wm.workspace_id where wm.user_id=auth.uid() and wm.active and wm.role='admin' limit 1;
  if w is null then raise exception 'Acesso administrativo necessário.'; end if;
  perform public.archive_old_performance_metrics_v0102();
  select jsonb_build_object(
    'workspace_name',wname,
    'processes',(select count(*) from public.cases c where c.workspace_id=w),
    'movements',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null),
    'active_users',(select count(*) from public.workspace_members wm where wm.workspace_id=w and wm.active),
    'imprecise_received',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null and not m.received_time_precise),
    'imprecise_sent',(select count(*) from public.movements m where m.workspace_id=w and m.deleted_at is null and m.sent_at is not null and not m.sent_time_precise),
    'technical_errors',(select count(*) from public.technical_errors te where te.workspace_id=w),
    'slow_operations',(select count(*) from public.technical_performance tp where tp.workspace_id=w and tp.archived_at is null),
    'archived_slow_operations',(select count(*) from public.technical_performance tp where tp.workspace_id=w and tp.archived_at is not null),
    'import_batches',(select count(*) from public.import_batches ib where ib.workspace_id=w),
    'database_bytes',pg_database_size(current_database()),
    'database_pretty',pg_size_pretty(pg_database_size(current_database())),
    'checked_at',now()
  ) into result;
  return result;
end;$$;
grant execute on function public.get_praxis_diagnostics_v0102() to authenticated;

commit;
