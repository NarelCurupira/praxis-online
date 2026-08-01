-- Práxis Online 0.10.7.7
-- Segurança das RPCs e retenção de telemetria técnica por 15 dias.
-- Migração idempotente para bancos existentes.

begin;

-- Impede execução anônima implícita nas funções atuais e futuras do schema public.
revoke execute on all functions in schema public from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- ============================================================
-- PRÁXIS ONLINE
-- ENDURECIMENTO RPC — CORREÇÕES OBJETIVAS CONSOLIDADAS
--
-- Corrige:
-- 1. MFA nas rotinas administrativas;
-- 2. uso determinístico de profiles.current_workspace_id;
-- 3. validação do responsável na edição individual;
-- 4. robustez e concorrência no aceite de convite.
--
-- Não altera:
-- - exposição de e-mails da equipe;
-- - regras de exclusão em lote;
-- - record_admin_audit;
-- - retenção/rate limiting de telemetria;
-- - diagnóstico de tamanho global;
-- - funções antigas e fallbacks.
--
-- A execução é transacional: qualquer erro reverte tudo.
-- ============================================================

-- ============================================================
-- archive_performance_metrics_v0102
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_performance_metrics_v0102()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid; affected integer;
begin
  select p.current_workspace_id into w
  from public.profiles p
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;
  update public.technical_performance set archived_at=now() where workspace_id=w and archived_at is null;
  get diagnostics affected=row_count;
  perform public.record_admin_audit('performance_metrics_archived',jsonb_build_object('records',affected));
  return affected;
end;$function$;

-- ============================================================
-- get_technical_settings_v0102
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_technical_settings_v0102()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid; result jsonb;
begin
  select p.current_workspace_id into w
  from public.profiles p
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;
  insert into public.workspace_technical_settings(workspace_id) values(w) on conflict(workspace_id) do nothing;
  select jsonb_build_object(
    'slow_operation_threshold_ms',slow_operation_threshold_ms,
    'performance_retention_days',performance_retention_days
  ) into result from public.workspace_technical_settings where workspace_id=w;
  return result;
end;$function$;

-- ============================================================
-- save_technical_settings_v0102
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_technical_settings_v0102(threshold_ms_value integer, retention_days_value integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid;
begin
  select p.current_workspace_id into w
  from public.profiles p
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;
  insert into public.workspace_technical_settings(workspace_id,slow_operation_threshold_ms,performance_retention_days,updated_by,updated_at)
  values(w,greatest(500,least(10000,threshold_ms_value)),greatest(7,least(365,retention_days_value)),auth.uid(),now())
  on conflict(workspace_id) do update set
    slow_operation_threshold_ms=excluded.slow_operation_threshold_ms,
    performance_retention_days=excluded.performance_retention_days,
    updated_by=auth.uid(),updated_at=now();
  perform public.record_admin_audit('technical_settings_changed',jsonb_build_object('threshold_ms',threshold_ms_value,'retention_days',retention_days_value));
end;$function$;

-- ============================================================
-- revert_import_batch_v0102
-- ============================================================

CREATE OR REPLACE FUNCTION public.revert_import_batch_v0102(target_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w uuid; batch_record public.import_batches%rowtype; snap record; current_updated timestamptz;
  restored_movements integer:=0; deleted_movements integer:=0; restored_cases integer:=0; deleted_cases integer:=0; skipped integer:=0;
begin
  select p.current_workspace_id into w
  from public.profiles p
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;
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
end;$function$;

-- ============================================================
-- update_workspace_member_access_v09
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_workspace_member_access_v09(target_user uuid, new_efficiency_access text, new_reports_access text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare ws uuid;target_role text;begin
 select p.current_workspace_id into ws from public.profiles p where p.id=auth.uid();
 if ws is null or not public.is_workspace_admin(ws) then raise exception 'Apenas o administrador com autenticação forte pode alterar permissões.';end if;
 if new_efficiency_access not in('none','own','team') or new_reports_access not in('none','own','team') then raise exception 'Escopo inválido.';end if;
 select role::text into target_role from public.workspace_members where workspace_id=ws and user_id=target_user;
 if target_role is null then raise exception 'Usuário não encontrado na equipe.'; end if;
 update public.workspace_members set efficiency_access=case when target_role in('admin','procurador') then 'team' when target_role in('estagiario','consulta') then 'none' else new_efficiency_access end,reports_access=case when target_role in('admin','procurador') then 'team' when target_role in('estagiario','consulta') then 'none' else new_reports_access end where workspace_id=ws and user_id=target_user;
end$function$;

-- ============================================================
-- update_workspace_member_presentation_v091
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_workspace_member_presentation_v091(target_user uuid, new_display_name text, new_efficiency_access text, new_reports_access text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ws uuid;
  target_role text;
  normalized_display_name text;
begin
  select p.current_workspace_id into ws
  from public.profiles p
  where p.id = auth.uid();

  if ws is null or not public.is_workspace_admin(ws) then
    raise exception 'Apenas o administrador com autenticação forte pode alterar nomes de exibição e permissões.';
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
$function$;

-- ============================================================
-- get_praxis_diagnostics_v0101
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_praxis_diagnostics_v0101()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid; wname text; result jsonb;
begin
  select p.current_workspace_id, ws.name
    into w, wname
  from public.profiles p
  join public.workspaces ws on ws.id = p.current_workspace_id
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
    raise exception 'Acesso administrativo e autenticação forte necessários.';
  end if;
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
end;$function$;

-- ============================================================
-- get_praxis_diagnostics_v0102
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_praxis_diagnostics_v0102()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w uuid;
  wname text;
  result jsonb;
begin
  select p.current_workspace_id, ws.name
    into w, wname
  from public.profiles p
  join public.workspaces ws on ws.id = p.current_workspace_id
  where p.id = auth.uid();

  if w is null or not public.is_workspace_admin(w) then
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
$function$;

-- ============================================================
-- update_movement_v0107
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_movement_v0107(target_movement bigint, payload jsonb, change_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ws uuid;
  actor_role text;
  actor_label text;
  oldm public.movements;
  newm public.movements;
  oldc public.cases;
  newc public.cases;
  new_received timestamptz;
  new_sent timestamptz;
  new_assigned_to uuid;
begin
  select * into oldm
  from public.movements
  where id = target_movement and deleted_at is null
  for update;

  if oldm.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  ws := oldm.workspace_id;
  actor_role := public.current_workspace_role(ws);
  actor_label := public.process_actor_name_v0107();
  if actor_role is null then
    raise exception 'Acesso negado.';
  end if;

  select * into oldc from public.cases where id = oldm.case_id;

  if actor_role = 'estagiario' then
    if oldm.assigned_to is distinct from auth.uid() then
      raise exception 'O estagiário só pode alterar processos atribuídos a ele.';
    end if;
    update public.movements
       set notes = coalesce(payload->>'notes', notes),
           updated_by = auth.uid(),
           updated_at = now()
     where id = target_movement;
    if oldm.notes is distinct from coalesce(payload->>'notes', oldm.notes) then
      insert into public.change_history(
        workspace_id, movement_id, changed_by, actor_name, action_name,
        field_name, old_value, new_value
      ) values (
        ws, target_movement, auth.uid(), actor_label, 'Edição do processo',
        'Observações', coalesce(oldm.notes, ''), coalesce(payload->>'notes', '')
      );
    end if;
    return;
  end if;

  if actor_role not in ('admin', 'procurador', 'assessor') then
    raise exception 'Perfil sem permissão de edição.';
  end if;

  new_received := coalesce(nullif(payload->>'receivedAt', '')::timestamptz, oldm.received_at);
  new_sent := nullif(payload->>'sentAt', '')::timestamptz;
  new_assigned_to := nullif(payload->>'assignedTo', '')::uuid;

  if new_assigned_to is not null
     and not exists (
       select 1
       from public.workspace_members wm
       where wm.workspace_id = ws
         and wm.user_id = new_assigned_to
         and wm.active
     ) then
    raise exception 'Responsável inválido ou inativo.';
  end if;

  if new_received is distinct from oldm.received_at and actor_role <> 'admin' then
    raise exception 'Somente o administrador pode alterar a entrada.';
  end if;
  if new_received is distinct from oldm.received_at and coalesce(trim(change_reason), '') = '' then
    raise exception 'Informe a justificativa da alteração da entrada.';
  end if;

  update public.cases
     set class_name = coalesce(payload->>'className', class_name),
         subject = coalesce(payload->>'subject', subject),
         socially_relevant = coalesce((payload->>'sociallyRelevant')::boolean, socially_relevant),
         extremely_complex = coalesce((payload->>'extremelyComplex')::boolean, extremely_complex),
         social_theme = coalesce(payload->>'socialTheme', social_theme),
         relevance_reason = coalesce(payload->>'relevanceReason', relevance_reason),
         fundamental_right = coalesce(payload->>'fundamentalRight', fundamental_right),
         affected_group = coalesce(payload->>'affectedGroup', affected_group),
         reach = coalesce(payload->>'reach', reach),
         territorial_scope = coalesce(payload->>'territorialScope', territorial_scope),
         impact_type = coalesce(payload->>'impactType', impact_type),
         social_result = coalesce(payload->>'socialResult', social_result),
         sdgs = case
           when jsonb_typeof(payload->'sdgs') = 'array'
             then array(select jsonb_array_elements_text(payload->'sdgs'))
           else sdgs
         end,
         complexity_reason = coalesce(payload->>'complexityReason', complexity_reason),
         updated_by = auth.uid(),
         updated_at = now()
   where id = oldm.case_id;

  update public.movements
     set received_at = new_received,
         received_time_precise = coalesce((payload->>'receivedTimePrecise')::boolean, received_time_precise),
         sent_at = case when actor_role = 'admin' then new_sent else sent_at end,
         sent_time_precise = case when actor_role = 'admin' then coalesce((payload->>'sentTimePrecise')::boolean, false) else sent_time_precise end,
         deadline_at = nullif(payload->>'deadlineAt', '')::date,
         action_type = coalesce(payload->>'actionType', action_type),
         notes = coalesce(payload->>'notes', notes),
         priority = coalesce(payload->>'priority', priority),
         document_path = coalesce(payload->>'documentPath', document_path),
         assigned_to = coalesce(new_assigned_to, assigned_to),
         updated_by = auth.uid(),
         updated_at = now()
   where id = target_movement;

  select * into newm from public.movements where id = target_movement;
  select * into newc from public.cases where id = oldm.case_id;

  insert into public.change_history(
    workspace_id, movement_id, changed_by, actor_name, action_name,
    field_name, old_value, new_value
  )
  select ws, target_movement, auth.uid(), actor_label, 'Edição do processo',
         item.field_name, item.old_value, item.new_value
  from (values
    ('Classe', coalesce(oldc.class_name, ''), coalesce(newc.class_name, '')),
    ('Assunto', coalesce(oldc.subject, ''), coalesce(newc.subject, '')),
    ('Entrada', coalesce(oldm.received_at::text, ''), coalesce(newm.received_at::text, '')),
    ('Prazo', coalesce(oldm.deadline_at::text, ''), coalesce(newm.deadline_at::text, '')),
    ('Providência', coalesce(oldm.action_type, ''), coalesce(newm.action_type, '')),
    ('Data de envio', coalesce(oldm.sent_at::text, ''), coalesce(newm.sent_at::text, '')),
    ('Observações', coalesce(oldm.notes, ''), coalesce(newm.notes, '')),
    ('Prioridade', coalesce(oldm.priority, ''), coalesce(newm.priority, '')),
    ('Responsável', coalesce(oldm.assigned_to::text, ''), coalesce(newm.assigned_to::text, '')),
    ('Relevância social', oldc.socially_relevant::text, newc.socially_relevant::text),
    ('Impacto social esperado', coalesce(oldc.social_result, ''), coalesce(newc.social_result, '')),
    ('ODS da ONU', array_to_string(oldc.sdgs, '; '), array_to_string(newc.sdgs, '; ')),
    ('Alta complexidade', oldc.extremely_complex::text, newc.extremely_complex::text),
    ('Justificativa da alteração de entrada', '', case when new_received is distinct from oldm.received_at then coalesce(change_reason, '') else '' end)
  ) as item(field_name, old_value, new_value)
  where item.old_value is distinct from item.new_value
    and not (item.field_name = 'Justificativa da alteração de entrada' and item.new_value = '');
end;
$function$;

-- ============================================================
-- accept_workspace_invite
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_workspace_invite(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_invite public.workspace_invites%rowtype;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  authenticated_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  if authenticated_email = '' then
    raise exception 'E-mail autenticado indisponível';
  end if;

  select *
    into target_invite
  from public.workspace_invites
  where token_hash = encode(extensions.digest(upper(trim(invite_token)), 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if target_invite.id is null then
    raise exception 'Convite inválido ou expirado';
  end if;

  if lower(trim(target_invite.email)) <> authenticated_email then
    raise exception 'Este convite pertence a outro e-mail';
  end if;

  update public.workspace_invites
  set accepted_at = now()
  where id = target_invite.id
    and accepted_at is null;

  if not found then
    raise exception 'Convite já utilizado';
  end if;

  insert into public.workspace_members(workspace_id, user_id, role, active)
  values (target_invite.workspace_id, auth.uid(), target_invite.role, true)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role, active = true;

  update public.profiles
  set current_workspace_id = target_invite.workspace_id
  where id = auth.uid();

  return target_invite.workspace_id;
end
$function$;


-- ============================================================
-- PERMISSÕES
-- ============================================================

-- Nenhuma das funções alteradas deve ficar disponível para PUBLIC ou anon.
revoke execute on function public.archive_performance_metrics_v0102()
from public, anon;

revoke execute on function public.get_technical_settings_v0102()
from public, anon;

revoke execute on function public.save_technical_settings_v0102(integer, integer)
from public, anon;

revoke execute on function public.revert_import_batch_v0102(bigint)
from public, anon;

revoke execute on function public.update_workspace_member_access_v09(uuid, text, text)
from public, anon;

revoke execute on function public.update_workspace_member_presentation_v091(uuid, text, text, text)
from public, anon;

revoke execute on function public.get_praxis_diagnostics_v0101()
from public, anon;

revoke execute on function public.get_praxis_diagnostics_v0102()
from public, anon;

revoke execute on function public.update_movement_v0107(bigint, jsonb, text)
from public, anon, authenticated;

revoke execute on function public.accept_workspace_invite(text)
from public, anon;

-- RPCs chamadas pelo frontend autenticado.
grant execute on function public.archive_performance_metrics_v0102()
to authenticated;

grant execute on function public.get_technical_settings_v0102()
to authenticated;

grant execute on function public.save_technical_settings_v0102(integer, integer)
to authenticated;

grant execute on function public.revert_import_batch_v0102(bigint)
to authenticated;

grant execute on function public.update_workspace_member_access_v09(uuid, text, text)
to authenticated;

grant execute on function public.update_workspace_member_presentation_v091(uuid, text, text, text)
to authenticated;

grant execute on function public.get_praxis_diagnostics_v0101()
to authenticated;

grant execute on function public.get_praxis_diagnostics_v0102()
to authenticated;

grant execute on function public.accept_workspace_invite(text)
to authenticated;

-- update_movement_v0107 permanece apenas como auxiliar interna.
-- O frontend usa update_movement_v01076, que a chama internamente.

-- ============================================================
-- PRÁXIS ONLINE
-- RETENÇÃO DE TELEMETRIA TÉCNICA — 15 DIAS
--
-- Escopo:
--   - public.technical_errors
--   - public.technical_performance
--
-- Preserva:
--   - admin_audit
--   - change_history / histórico processual
--   - importações
--   - configurações
--   - demais dados funcionais
--
-- Segurança:
--   - exige usuário autenticado;
--   - usa profiles.current_workspace_id;
--   - exige administrador com MFA;
--   - apaga somente dados do workspace atual;
--   - registra a operação em admin_audit;
--   - não permite execução por anon ou PUBLIC.
-- ============================================================

create or replace function public.cleanup_technical_telemetry_v0108(
  retention_days integer default 15
)
returns table (
  deleted_errors bigint,
  deleted_performance bigint,
  cutoff_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id uuid;
  target_workspace uuid;
  cutoff_value timestamptz;
  errors_count bigint := 0;
  performance_count bigint := 0;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  -- Protege contra retenções acidentalmente curtas ou excessivamente longas.
  if retention_days is null or retention_days < 1 or retention_days > 365 then
    raise exception 'O período de retenção deve estar entre 1 e 365 dias.';
  end if;

  select p.current_workspace_id
    into target_workspace
  from public.profiles p
  where p.id = actor_id;

  if target_workspace is null then
    raise exception 'Workspace atual não definido.';
  end if;

  if not public.is_workspace_admin(target_workspace) then
    raise exception 'A limpeza exige administrador com autenticação forte.';
  end if;

  cutoff_value := now() - make_interval(days => retention_days);

  delete from public.technical_errors te
  where te.workspace_id = target_workspace
    and te.created_at < cutoff_value;

  get diagnostics errors_count = row_count;

  delete from public.technical_performance tp
  where tp.workspace_id = target_workspace
    and tp.created_at < cutoff_value;

  get diagnostics performance_count = row_count;

  perform public.record_admin_audit(
    'technical_telemetry_cleanup',
    jsonb_build_object(
      'retention_days', retention_days,
      'cutoff_at', cutoff_value,
      'deleted_errors', errors_count,
      'deleted_performance', performance_count
    )
  );

  return query
  select
    errors_count,
    performance_count,
    cutoff_value;
end;
$function$;

revoke execute
on function public.cleanup_technical_telemetry_v0108(integer)
from public, anon;

grant execute
on function public.cleanup_technical_telemetry_v0108(integer)
to authenticated;

-- Adota 15 dias como padrão de monitoramento técnico para instalações novas
-- e para workspaces que ainda mantinham o valor histórico de 30 dias.
alter table if exists public.workspace_technical_settings
  alter column performance_retention_days set default 15;

update public.workspace_technical_settings
set performance_retention_days = 15,
    updated_at = now()
where performance_retention_days = 30;

commit;
