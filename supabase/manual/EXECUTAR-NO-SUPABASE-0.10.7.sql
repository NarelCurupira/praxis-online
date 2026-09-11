-- Práxis Online 0.10.7
-- Histórico próprio por processo, arquivamento e operações em lote.
begin;

alter table public.movements
  add column if not exists archived_at timestamptz;

alter table public.change_history
  add column if not exists action_name text not null default 'Alteração',
  add column if not exists actor_name text not null default '';

create index if not exists movements_workspace_archived_idx
  on public.movements(workspace_id, archived_at, received_at desc)
  where deleted_at is null;

create index if not exists change_history_workspace_movement_changed_idx
  on public.change_history(workspace_id, movement_id, changed_at desc);

create or replace function public.process_actor_name_v0107()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(u.email), ''),
    'Usuário não identificado'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

revoke all on function public.process_actor_name_v0107() from public;
grant execute on function public.process_actor_name_v0107() to authenticated;

create or replace function public.update_movement_action_v0106(
  target_movement bigint,
  new_action_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace uuid;
  target_assignee uuid;
  actor_role text;
  old_action_type text;
begin
  select m.workspace_id, m.assigned_to, m.action_type
    into target_workspace, target_assignee, old_action_type
  from public.movements m
  where m.id = target_movement
    and m.deleted_at is null
  for update;

  if target_workspace is null then
    raise exception 'Processo não encontrado.';
  end if;

  actor_role := public.current_workspace_role(target_workspace);
  if actor_role is null
     or (actor_role not in ('admin', 'procurador', 'assessor')
         and not (actor_role = 'estagiario' and target_assignee = auth.uid()))
  then
    raise exception 'Perfil sem permissão para alterar a providência.';
  end if;

  if coalesce(old_action_type, '') is not distinct from coalesce(new_action_type, '') then
    return;
  end if;

  update public.movements
     set action_type = coalesce(new_action_type, ''),
         updated_by = auth.uid(),
         updated_at = now()
   where id = target_movement
     and workspace_id = target_workspace;

  insert into public.change_history(
    workspace_id, movement_id, changed_by, actor_name, action_name,
    field_name, old_value, new_value
  )
  values(
    target_workspace, target_movement, auth.uid(),
    public.process_actor_name_v0107(), 'Alteração de intervenção',
    'Providência', coalesce(old_action_type, ''), coalesce(new_action_type, '')
  );
end;
$$;

revoke all on function public.update_movement_action_v0106(bigint, text) from public;
grant execute on function public.update_movement_action_v0106(bigint, text) to authenticated;

create or replace function public.update_movement_v0107(
  target_movement bigint,
  payload jsonb,
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
         assigned_to = coalesce(nullif(payload->>'assignedTo', '')::uuid, assigned_to),
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
$$;

revoke all on function public.update_movement_v0107(bigint, jsonb, text) from public;
grant execute on function public.update_movement_v0107(bigint, jsonb, text) to authenticated;

create or replace function public.bulk_update_movements_v0107(
  target_movements bigint[],
  operation_name text,
  operation_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ids bigint[];
  ws uuid;
  actor_role text;
  actor_label text;
  target_user uuid;
  target_user_name text;
  selected_count integer;
begin
  select array_agg(distinct value) into ids
  from unnest(target_movements) as value
  where value is not null;

  if coalesce(cardinality(ids), 0) = 0 then
    return;
  end if;

  select m.workspace_id into ws
  from public.movements m
  where m.id = any(ids) and m.deleted_at is null
  limit 1;

  select count(*) into selected_count
  from public.movements m
  where m.id = any(ids) and m.workspace_id = ws and m.deleted_at is null;

  if ws is null or selected_count <> cardinality(ids) then
    raise exception 'Um ou mais processos não foram encontrados.';
  end if;

  actor_role := public.current_workspace_role(ws);
  actor_label := public.process_actor_name_v0107();
  if actor_role is null then
    raise exception 'Acesso negado.';
  end if;

  if operation_name in ('assignment', 'archive', 'delete')
     and actor_role not in ('admin', 'procurador', 'assessor') then
    raise exception 'Perfil sem permissão para esta operação em lote.';
  end if;

  if operation_name = 'action'
     and actor_role not in ('admin', 'procurador', 'assessor')
     and not (
       actor_role = 'estagiario'
       and not exists (
         select 1 from public.movements m
         where m.id = any(ids) and m.assigned_to is distinct from auth.uid()
       )
     ) then
    raise exception 'Perfil sem permissão para alterar a intervenção destes processos.';
  end if;

  if operation_name = 'assignment' then
    target_user := nullif(operation_value, '')::uuid;
    select p.full_name into target_user_name
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = ws and wm.user_id = target_user and wm.active;
    if target_user_name is null then
      raise exception 'Responsável inválido ou inativo.';
    end if;

    insert into public.change_history(
      workspace_id, movement_id, changed_by, actor_name, action_name,
      field_name, old_value, new_value
    )
    select ws, m.id, auth.uid(), actor_label, 'Alteração em lote',
           'Responsável', coalesce(old_profile.full_name, m.assigned_to::text, ''), target_user_name
    from public.movements m
    left join public.profiles old_profile on old_profile.id = m.assigned_to
    where m.id = any(ids) and m.assigned_to is distinct from target_user;

    update public.movements
       set assigned_to = target_user, updated_by = auth.uid(), updated_at = now()
     where id = any(ids) and assigned_to is distinct from target_user;

  elsif operation_name = 'action' then
    insert into public.change_history(
      workspace_id, movement_id, changed_by, actor_name, action_name,
      field_name, old_value, new_value
    )
    select ws, m.id, auth.uid(), actor_label, 'Alteração em lote',
           'Providência', coalesce(m.action_type, ''), coalesce(operation_value, '')
    from public.movements m
    where m.id = any(ids)
      and coalesce(m.action_type, '') is distinct from coalesce(operation_value, '');

    update public.movements
       set action_type = coalesce(operation_value, ''), updated_by = auth.uid(), updated_at = now()
     where id = any(ids)
       and coalesce(action_type, '') is distinct from coalesce(operation_value, '');

  elsif operation_name = 'archive' then
    insert into public.change_history(
      workspace_id, movement_id, changed_by, actor_name, action_name,
      field_name, old_value, new_value
    )
    select ws, m.id, auth.uid(), actor_label, 'Arquivamento em lote',
           'Arquivado', 'Não', 'Sim'
    from public.movements m
    where m.id = any(ids) and m.archived_at is null;

    update public.movements
       set archived_at = now(), updated_by = auth.uid(), updated_at = now()
     where id = any(ids) and archived_at is null;

  elsif operation_name = 'delete' then
    insert into public.change_history(
      workspace_id, movement_id, changed_by, actor_name, action_name,
      field_name, old_value, new_value
    )
    select ws, m.id, auth.uid(), actor_label, 'Exclusão em lote',
           'Lixeira', 'Não', 'Sim'
    from public.movements m
    where m.id = any(ids) and m.deleted_at is null;

    update public.movements
       set deleted_at = now(), updated_by = auth.uid(), updated_at = now()
     where id = any(ids) and deleted_at is null;
  else
    raise exception 'Operação em lote inválida.';
  end if;
end;
$$;

revoke all on function public.bulk_update_movements_v0107(bigint[], text, text) from public;
grant execute on function public.bulk_update_movements_v0107(bigint[], text, text) to authenticated;

create or replace function public.list_process_history_v0107(target_movement bigint)
returns table(
  id bigint,
  movement_id bigint,
  changed_at timestamptz,
  actor_name text,
  action_name text,
  field_name text,
  old_value text,
  new_value text
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.movement_id, h.changed_at,
         coalesce(nullif(h.actor_name, ''), nullif(p.full_name, ''), 'Usuário não identificado'),
         coalesce(nullif(h.action_name, ''), 'Alteração'),
         h.field_name, h.old_value, h.new_value
  from public.change_history h
  left join public.profiles p on p.id = h.changed_by
  where h.movement_id = target_movement
    and public.is_workspace_member(h.workspace_id)
  order by h.changed_at desc, h.id desc
$$;

revoke all on function public.list_process_history_v0107(bigint) from public;
grant execute on function public.list_process_history_v0107(bigint) to authenticated;

commit;
