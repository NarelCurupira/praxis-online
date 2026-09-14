-- Práxis 1.1.0 · atualização de uma instalação 1.0 completa.
-- Execute este arquivo inteiro no SQL Editor ANTES de publicar o frontend.
-- Não reaplique schema.sql ou migrações históricas em um banco em uso.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
do $$ begin
  if to_regprocedure('public.update_movement_v01076(bigint,jsonb,text)') is null
     or to_regprocedure('public.praxis_has_strong_auth()') is null
     or to_regclass('public.push_deliveries') is null then
    raise exception 'Instalação 1.0 incompleta: faltam migrações anteriores. Nenhuma alteração 1.1 foi aplicada.';
  end if;
end $$;

-- Ausência de informação nunca produz uma data inventada. Histórico preservado.
create or replace function public.default_missing_sent_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sent_at is null then new.sent_time_precise := false; new.elapsed_hours := null; end if;
  return new;
end $$;

create or replace function public.increment_movement_version_v11()
returns trigger language plpgsql set search_path = public as $$
begin new.row_version := old.row_version + 1; return new; end $$;
drop trigger if exists zz_movement_version_v11 on public.movements;
create trigger zz_movement_version_v11 before update on public.movements
for each row execute function public.increment_movement_version_v11();

-- Uma política permissiva antiga não pode dispensar MFA nas escritas administrativas.
do $$ declare t text; command text; begin
  foreach t in array array['class_settings','calendar_exclusions','workspace_settings','closed_periods'] loop
    foreach command in array array['INSERT','UPDATE','DELETE'] loop
      execute format('drop policy if exists %I on public.%I', 'strong_admin_v11_'||lower(command),t);
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'strong_admin_v11_'||lower(command),t,command,
        case when command='INSERT' then 'with check (public.is_workspace_admin(workspace_id))'
             when command='DELETE' then 'using (public.is_workspace_admin(workspace_id))'
             else 'using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id))' end);
    end loop;
  end loop;
  foreach t in array array['cases','movements'] loop
    execute format('drop policy if exists strong_delete_v11 on public.%I',t);
    execute format('create policy strong_delete_v11 on public.%I as restrictive for delete to authenticated using (public.is_workspace_admin(workspace_id))',t);
  end loop;
end $$;

-- Recibos privados: uma operação offline confirmada nunca é aplicada duas vezes.
create table if not exists public.operation_receipts_v11 (
  operation_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request jsonb not null, response jsonb not null, movement_id bigint not null, created_at timestamptz not null default now()
);
alter table public.operation_receipts_v11 enable row level security;
revoke all on public.operation_receipts_v11 from public, anon, authenticated;

create or replace function public.apply_movement_operation_v11(
  target_workspace uuid, operation_id uuid, operation_kind text, target_movement bigint,
  payload jsonb, expected_version integer default null, expected_case_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.movements; c public.cases; role_name text; result_id bigint; case_id_value bigint;
  receipt public.operation_receipts_v11; request_value jsonb; response_value jsonb; assigned uuid; sent timestamptz;
begin
  role_name := public.current_workspace_role(target_workspace);
  if auth.uid() is null or role_name is null or role_name not in ('admin','procurador','assessor','estagiario')
    or target_workspace is distinct from public.current_praxis_workspace_v01082() then
    raise exception 'Procuradoria ou sessão alterada. Atualize os dados antes de gravar.';
  end if;
  if operation_id is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Operação inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 11));
  request_value := jsonb_build_object('kind',operation_kind,'movement',target_movement,'payload',payload);
  select * into receipt from public.operation_receipts_v11 r where r.operation_id=apply_movement_operation_v11.operation_id;
  if found then
    if receipt.user_id<>auth.uid() or receipt.workspace_id<>target_workspace or receipt.request<>request_value then
      raise exception 'Identificador de operação já utilizado.';
    end if;
    return receipt.response;
  end if;
  if operation_kind='create' then
    if role_name='estagiario' then raise exception 'Perfil sem permissão de cadastro.'; end if;
    if coalesce(trim(payload->>'judicialNumber'),'')='' or nullif(payload->>'receivedAt','') is null then raise exception 'Número e entrada obrigatórios.'; end if;
    assigned := coalesce(nullif(payload->>'assignedTo','')::uuid,auth.uid());
    if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=assigned and active) then raise exception 'Responsável inválido.'; end if;
    -- Bloqueio também cobre dois cadastros simultâneos do mesmo processo.
    perform pg_advisory_xact_lock(hashtextextended(target_workspace::text || (payload->>'judicialNumber'), 12));
    select id into case_id_value from public.cases where workspace_id=target_workspace and judicial_number=payload->>'judicialNumber';
    if case_id_value is null then
      insert into public.cases(workspace_id,mp_number,judicial_number,class_name,subject,socially_relevant,extremely_complex,social_theme,relevance_reason,fundamental_right,affected_group,reach,territorial_scope,impact_type,social_result,sdgs,complexity_reason,created_by,updated_by)
      values(target_workspace,coalesce(payload->>'mpNumber',''),payload->>'judicialNumber',coalesce(payload->>'className',''),coalesce(payload->>'subject',''),coalesce((payload->>'sociallyRelevant')::boolean,false),coalesce((payload->>'extremelyComplex')::boolean,false),coalesce(payload->>'socialTheme',''),coalesce(payload->>'relevanceReason',''),coalesce(payload->>'fundamentalRight',''),coalesce(payload->>'affectedGroup',''),coalesce(payload->>'reach',''),coalesce(payload->>'territorialScope',''),coalesce(payload->>'impactType',''),coalesce(payload->>'socialResult',''),array(select jsonb_array_elements_text(coalesce(payload->'sdgs','[]'))),coalesce(payload->>'complexityReason',''),auth.uid(),auth.uid()) returning id into case_id_value;
    end if;
    insert into public.movements(workspace_id,case_id,received_at,received_time_precise,deadline_at,action_type,notes,priority,procedural_priority,document_path,assigned_to,created_by,updated_by)
    values(target_workspace,case_id_value,(payload->>'receivedAt')::timestamptz,coalesce((payload->>'receivedTimePrecise')::boolean,true),nullif(payload->>'deadlineAt','')::date,coalesce(payload->>'actionType',''),coalesce(payload->>'notes',''),coalesce(payload->>'priority','Normal'),coalesce(payload->>'proceduralPriority','Nenhuma'),coalesce(payload->>'documentPath',''),assigned,auth.uid(),auth.uid()) returning id into result_id;
  else
    select * into m from public.movements where id=target_movement and workspace_id=target_workspace for update;
    if not found or m.deleted_at is not null or m.archived_at is not null then raise exception 'Movimentação indisponível, excluída ou arquivada.'; end if;
    if role_name='estagiario' and m.assigned_to is distinct from auth.uid() then raise exception 'Processo de outro responsável.'; end if;
    select * into c from public.cases where id=m.case_id and workspace_id=target_workspace for update;
    if expected_version is not null and m.row_version<>expected_version then raise exception 'Conflito: o processo foi alterado por outra pessoa. Atualize os dados e revise sua alteração.' using errcode='40001'; end if;
    if expected_case_updated_at is not null and c.updated_at<>expected_case_updated_at then raise exception 'Conflito: o cadastro do processo foi alterado. Atualize os dados.' using errcode='40001'; end if;
    if operation_kind='edit' then
      perform public.update_movement_v01076(target_movement,payload,payload->>'sensitiveChangeReason');
    elsif operation_kind='action' then
      perform public.update_movement_action_v0106(target_movement,payload->>'actionType');
    elsif operation_kind='assignment' then
      if role_name='estagiario' then raise exception 'Perfil sem permissão de distribuição.'; end if;
      perform public.bulk_update_movements_v0107(array[target_movement],'assignment',payload->>'assignedTo');
    elsif operation_kind='status' then
      sent := case when payload->>'status'='Enviado' then coalesce(nullif(payload->>'occurredAt','')::timestamptz,now()) else null end;
      if sent is not null and sent<m.received_at then raise exception 'O envio não pode ser anterior à entrada.'; end if;
      update public.movements set workflow_status=payload->>'status',
        action_type=coalesce(payload->>'actionType',action_type),
        draft_status=case when payload->>'status' in ('Minutado','Enviado') then 'Minutado' else draft_status end,
        sent_at=sent,sent_time_precise=(sent is not null),elapsed_hours=null,updated_by=auth.uid(),updated_at=now()
        where id=target_movement;
      insert into public.change_history(workspace_id,movement_id,changed_by,action_name,field_name,old_value,new_value)
      values(target_workspace,target_movement,auth.uid(),'Alteração de status','Status',m.workflow_status,payload->>'status');
    else raise exception 'Tipo de operação não suportado.'; end if;
    result_id := target_movement;
  end if;
  select jsonb_build_object('id',m1.id,'rowVersion',m1.row_version,'caseUpdatedAt',c1.updated_at)
    into response_value from public.movements m1 join public.cases c1 on c1.id=m1.case_id where m1.id=result_id;
  insert into public.operation_receipts_v11(operation_id,user_id,workspace_id,request,response,movement_id)
    values(apply_movement_operation_v11.operation_id,auth.uid(),target_workspace,request_value,response_value,result_id);
  return response_value;
end $$;
revoke all on function public.apply_movement_operation_v11(uuid,uuid,text,bigint,jsonb,integer,timestamptz) from public,anon;
grant execute on function public.apply_movement_operation_v11(uuid,uuid,text,bigint,jsonb,integer,timestamptz) to authenticated;

-- Backup operacional: inclui lixeira, arquivos e histórico; não inclui credenciais/Auth.
create table if not exists public.recovery_snapshots_v11 (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), payload jsonb not null
);
alter table public.recovery_snapshots_v11 enable row level security;
revoke all on public.recovery_snapshots_v11 from public,anon,authenticated;
create or replace function public.export_operational_backup_v11(target_workspace uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.is_workspace_admin(target_workspace) then raise exception 'Backup exige administrador com autenticação forte.'; end if;
 return jsonb_build_object('format','praxis-operational','version',1,'workspaceId',target_workspace,'createdAt',now(),
   'cases',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.cases c where workspace_id=target_workspace),'[]'::jsonb),
   'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.movements m where workspace_id=target_workspace),'[]'::jsonb),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from public.change_history h where workspace_id=target_workspace),'[]'::jsonb),
   'settings',(select to_jsonb(s) from public.workspace_settings s where workspace_id=target_workspace),
   'calendar',coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_exclusions e where workspace_id=target_workspace),'[]'::jsonb),
   'classes',coalesce((select jsonb_agg(to_jsonb(s)) from public.class_settings s where workspace_id=target_workspace),'[]'::jsonb));
end $$;
create or replace function public.restore_operational_backup_v11(target_workspace uuid, backup jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare t text; item jsonb; columns_list text; update_list text; recovered integer; snapshot_id uuid;
begin
 if not public.is_workspace_admin(target_workspace) or target_workspace is distinct from public.current_praxis_workspace_v01082() then raise exception 'Recuperação exige administrador com autenticação forte na Procuradoria ativa.'; end if;
 if backup->>'format' is distinct from 'praxis-operational' or backup->>'version' is distinct from '1'
   or backup->>'workspaceId' is distinct from target_workspace::text
   or jsonb_typeof(backup->'cases') is distinct from 'array' or jsonb_typeof(backup->'movements') is distinct from 'array' then raise exception 'Backup incompatível ou de outra Procuradoria.'; end if;
 -- Impede interferência concorrente durante a cópia anterior e a recuperação.
 lock table public.cases, public.movements in share row exclusive mode;
 insert into public.recovery_snapshots_v11(workspace_id,created_by,payload)
 values(target_workspace,auth.uid(),public.export_operational_backup_v11(target_workspace)) returning id into snapshot_id;
 foreach t in array array['cases','movements'] loop
   if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(backup->t)) then raise exception 'IDs repetidos no backup.'; end if;
   select string_agg(format('%I',attname),',' order by attnum),
          string_agg(format('%1$I=excluded.%1$I',attname),',' order by attnum) filter(where attname not in ('id','workspace_id','created_at','created_by','row_version'))
   into columns_list,update_list from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped and attgenerated='';
   for item in select value from jsonb_array_elements(backup->t) loop
     if item->>'workspace_id' is distinct from target_workspace::text or coalesce((item->>'id')::bigint,0)<=0 then raise exception 'Registro inválido no backup.'; end if;
     if t='cases' and exists(select 1 from public.cases where id=(item->>'id')::bigint and workspace_id<>target_workspace)
        or t='movements' and exists(select 1 from public.movements where id=(item->>'id')::bigint and workspace_id<>target_workspace) then raise exception 'Identificador pertence a outra Procuradoria.'; end if;
     if t='movements' and not exists(select 1 from public.cases where id=(item->>'case_id')::bigint and workspace_id=target_workspace) then raise exception 'Processo pai ausente ou inválido.'; end if;
     item := item || jsonb_build_object('updated_by',auth.uid(),'updated_at',now());
     execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(id) do update set %3$s',t,columns_list,update_list) using item;
   end loop;
 end loop;
 recovered := jsonb_array_length(backup->'movements');
 -- Não remove registros ausentes do arquivo, não reescreve auditoria nem configurações.
 perform public.record_admin_audit('backup_recovered_v11',jsonb_build_object('movements',recovered,'previous_snapshot',snapshot_id));
 return recovered;
end $$;
revoke all on function public.export_operational_backup_v11(uuid) from public,anon;
revoke all on function public.restore_operational_backup_v11(uuid,jsonb) from public,anon;
grant execute on function public.export_operational_backup_v11(uuid) to authenticated;
grant execute on function public.restore_operational_backup_v11(uuid,jsonb) to authenticated;

-- Proteção de notificações em dispositivos compartilhados.
create or replace function public.upsert_push_subscription_v0113(
  subscription_endpoint text,
  subscription_p256dh text,
  subscription_auth text,
  subscription_user_agent text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if length(trim(coalesce(subscription_endpoint,''))) < 20 then raise exception 'Assinatura Push inválida.'; end if;
  if trim(coalesce(subscription_p256dh,'')) = '' or trim(coalesce(subscription_auth,'')) = '' then
    raise exception 'Chaves da assinatura Push não informadas.';
  end if;

  if subscription_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$'
     or length(subscription_endpoint)>4096 or length(subscription_p256dh) not between 80 and 100
     or length(subscription_auth) not between 20 and 30 then raise exception 'Provedor ou chaves Push inválidos.'; end if;
  if not exists(select 1 from public.workspace_members where user_id=auth.uid() and active) then raise exception 'Conta sem vínculo ativo.'; end if;
  -- Não transfere um endpoint entre contas: o navegador deve gerar uma nova assinatura.
  perform pg_advisory_xact_lock(hashtextextended(subscription_endpoint,13));
  if exists(select 1 from public.push_subscriptions where endpoint=subscription_endpoint and user_id<>auth.uid()) then
    raise exception 'Assinatura vinculada a outra conta. Desative e ative as notificações neste dispositivo.';
  end if;
  insert into public.push_subscriptions(
    user_id, endpoint, p256dh, auth_secret, user_agent, enabled, failure_count, last_error, last_seen_at, updated_at
  ) values(
    auth.uid(), subscription_endpoint, subscription_p256dh, subscription_auth,
    left(coalesce(subscription_user_agent,''), 500), true, 0, '', now(), now()
  )
  on conflict(endpoint) do update set
    user_id = auth.uid(),
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    enabled = true,
    failure_count = 0,
    last_error = '',
    last_seen_at = now(),
    updated_at = now()
  returning id into subscription_id;

  return subscription_id;
end
$$;


-- Proteção de notificações em dispositivos compartilhados.
create or replace function public.remove_push_subscription_v0113(subscription_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_subscriptions
     set enabled = false, updated_at = now()
   where endpoint = subscription_endpoint and user_id = auth.uid();
  update public.push_deliveries d set state='failed',last_error='Assinatura desativada.'
  from public.push_subscriptions s where s.id=d.subscription_id and s.endpoint=subscription_endpoint
    and s.user_id=auth.uid() and d.state in ('queued','processing');
end $$;


-- Proteção de notificações em dispositivos compartilhados.
create or replace function public.claim_push_deliveries_v0113(
  target_user uuid default null,
  batch_limit integer default 50
)
returns table(
  delivery_id bigint,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  notification_id uuid,
  recipient_user_id uuid,
  workspace_id uuid,
  movement_id bigint,
  notification_type text,
  severity text,
  title text,
  body text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select d.id
    from public.push_deliveries d
    join public.user_notifications n on n.id = d.notification_id
    join public.push_subscriptions s on s.id = d.subscription_id and s.enabled
    where s.user_id=n.recipient_user_id
      and exists(select 1 from public.workspace_members wm where wm.workspace_id=n.workspace_id and wm.user_id=n.recipient_user_id and wm.active)
      and ((d.state = 'queued' and d.next_attempt_at <= now())
        or (d.state = 'processing' and d.claimed_at < now() - interval '10 minutes'))
      and (target_user is null or n.recipient_user_id = target_user)
    order by d.id
    for update of d skip locked
    limit greatest(1,least(coalesce(batch_limit,50),100))
  ), claimed as (
    update public.push_deliveries d
       set state = 'processing', claimed_at = now(), attempts = d.attempts + 1
      from candidates c
     where d.id = c.id
    returning d.id, d.notification_id, d.subscription_id
  )
  select
    c.id, s.id, s.endpoint, s.p256dh, s.auth_secret,
    n.id, n.recipient_user_id, n.workspace_id, n.movement_id,
    n.notification_type, n.severity, 'Práxis'::text, 'Há uma atualização na Central de Informações. Entre para consultar.'::text
  from claimed c
  join public.user_notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.id = c.subscription_id;
end
$$;


notify pgrst, 'reload schema';
commit;

select 'Práxis 1.1: atualização SQL concluída' as resultado;
