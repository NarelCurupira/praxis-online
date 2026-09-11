-- Práxis Online 0.10.8.0
-- Múltiplas Procuradorias de Justiça, isolamento do workspace ativo,
-- gestão de vínculos e transferência administrativa de processos.
-- Execute integralmente no SQL Editor do Supabase após a 0.10.7.9.

begin;

-- O nome institucional já configurado era a identificação pública da unidade
-- antes de existir o seletor multi-Procuradoria. Na primeira migração, ele
-- passa a ser também o nome do workspace quando estiver preenchido.
update public.workspaces w
   set name = trim(s.unit_name)
  from public.workspace_settings s
 where s.workspace_id = w.id
   and trim(coalesce(s.unit_name, '')) <> '';

-- ============================================================
-- 1. CONTEXTO ATIVO
-- ============================================================

create or replace function public.is_current_workspace_v01080(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.workspace_members wm
      on wm.workspace_id = p.current_workspace_id
     and wm.user_id = p.id
     and wm.active
    where p.id = auth.uid()
      and p.current_workspace_id = target_workspace
  )
$$;

-- Mantém as APIs preparatórias da 0.10.7.9 disponíveis e determinísticas.
create or replace function public.list_my_workspaces_v01079()
returns table(workspace_id uuid, workspace_name text, role public.praxis_role, is_current boolean)
language sql stable security definer set search_path = public
as $$
  select wm.workspace_id, w.name, wm.role, wm.workspace_id = p.current_workspace_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  join public.profiles p on p.id = auth.uid()
  where wm.user_id = auth.uid() and wm.active
  order by (wm.workspace_id = p.current_workspace_id) desc, w.name collate "C"
$$;

create or replace function public.set_current_workspace_v01079(target_workspace uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace and wm.user_id = auth.uid() and wm.active
  ) then
    raise exception 'Você não possui acesso ativo a esta Procuradoria.';
  end if;

  update public.profiles set current_workspace_id = target_workspace where id = auth.uid();
end
$$;

-- ============================================================
-- 2. ADMINISTRAÇÃO DAS PROCURADORIAS
-- ============================================================

create or replace function public.list_admin_workspaces_v01080()
returns table(workspace_id uuid, workspace_name text, is_current boolean, member_count bigint)
language sql stable security definer set search_path = public
as $$
  select w.id, w.name, w.id = p.current_workspace_id,
         count(*) filter (where members.active)::bigint
  from public.workspace_members mine
  join public.workspaces w on w.id = mine.workspace_id
  join public.profiles p on p.id = auth.uid()
  left join public.workspace_members members on members.workspace_id = w.id
  where mine.user_id = auth.uid()
    and mine.active
    and mine.role = 'admin'
    and public.is_workspace_admin(w.id)
  group by w.id, w.name, p.current_workspace_id
  order by (w.id = p.current_workspace_id) desc, w.name collate "C"
$$;

create or replace function public.create_workspace_v01080(
  workspace_name_value text,
  copy_current_configuration boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_workspace uuid;
  new_workspace uuid;
  normalized_name text := trim(coalesce(workspace_name_value, ''));
begin
  select p.current_workspace_id into source_workspace
  from public.profiles p where p.id = auth.uid();

  if source_workspace is null or not public.is_workspace_admin(source_workspace) then
    raise exception 'Apenas o administrador da Procuradoria atual pode cadastrar outra unidade.';
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'O nome da Procuradoria deve possuir entre 3 e 120 caracteres.';
  end if;
  if exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid() and wm.active and lower(trim(w.name)) = lower(normalized_name)
  ) then
    raise exception 'Já existe uma Procuradoria acessível com esse nome.';
  end if;

  insert into public.workspaces(name, created_by)
  values(normalized_name, auth.uid()) returning id into new_workspace;

  insert into public.workspace_members(
    workspace_id, user_id, role, active, mfa_required, efficiency_access, reports_access
  ) values(
    new_workspace, auth.uid(), 'admin', true, true, 'team', 'team'
  );

  if copy_current_configuration then
    insert into public.workspace_settings(
      workspace_id, workday_hours, workday_start, workday_end,
      default_deadline_business_days, count_from_next_business_day, after_hours_policy,
      unit_name, lead_prosecutor, report_footer, default_report_mode, default_report_period,
      allow_named_comparisons, require_action_on_send, require_assignee_on_progress,
      detect_duplicates, require_date_change_reason, block_closed_periods, updated_at
    )
    select
      new_workspace, s.workday_hours, s.workday_start, s.workday_end,
      s.default_deadline_business_days, s.count_from_next_business_day, s.after_hours_policy,
      normalized_name, '', s.report_footer, s.default_report_mode, s.default_report_period,
      s.allow_named_comparisons, s.require_action_on_send, s.require_assignee_on_progress,
      s.detect_duplicates, s.require_date_change_reason, s.block_closed_periods, now()
    from public.workspace_settings s where s.workspace_id = source_workspace;

    if not found then
      insert into public.workspace_settings(workspace_id, unit_name)
      values(new_workspace, normalized_name);
    end if;

    insert into public.class_settings(workspace_id, name, business_days)
    select new_workspace, name, business_days
    from public.class_settings where workspace_id = source_workspace
    on conflict(workspace_id, name) do nothing;

    insert into public.calendar_exclusions(workspace_id, date, label)
    select new_workspace, date, label
    from public.calendar_exclusions where workspace_id = source_workspace
    on conflict(workspace_id, date) do nothing;
  else
    insert into public.workspace_settings(workspace_id, unit_name)
    values(new_workspace, normalized_name);
  end if;

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values
    (source_workspace, auth.uid(), 'workspace_created', jsonb_build_object('workspace_id', new_workspace, 'name', normalized_name)),
    (new_workspace, auth.uid(), 'workspace_created', jsonb_build_object('source_workspace', source_workspace, 'name', normalized_name));

  return new_workspace;
end
$$;

create or replace function public.rename_workspace_v01080(target_workspace uuid, workspace_name_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(coalesce(workspace_name_value, ''));
  previous_name text;
begin
  if not public.is_workspace_admin(target_workspace) then
    raise exception 'Apenas o administrador desta Procuradoria pode alterar seu nome.';
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'O nome da Procuradoria deve possuir entre 3 e 120 caracteres.';
  end if;

  select name into previous_name from public.workspaces where id = target_workspace;
  update public.workspaces set name = normalized_name where id = target_workspace;
  update public.workspace_settings
     set unit_name = normalized_name, updated_at = now()
   where workspace_id = target_workspace
     and (unit_name is null or trim(unit_name) = '' or trim(unit_name) = trim(coalesce(previous_name, '')));

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values(target_workspace, auth.uid(), 'workspace_renamed', jsonb_build_object('name', normalized_name));
end
$$;

create or replace function public.list_workspace_directory_v01080(target_workspace uuid)
returns table(
  user_id uuid,
  full_name text,
  email text,
  enabled boolean,
  role public.praxis_role,
  efficiency_access text,
  reports_access text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(target_workspace) then
    raise exception 'Apenas o administrador desta Procuradoria pode gerenciar seus integrantes.';
  end if;

  return query
  with managed as (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid() and wm.active and wm.role = 'admin'
  ), known_users as (
    select distinct wm.user_id
    from public.workspace_members wm
    join managed m on m.workspace_id = wm.workspace_id
  )
  select
    ku.user_id,
    p.full_name::text,
    coalesce(u.email, '')::text,
    coalesce(target.active, false),
    coalesce(target.role, 'consulta'::public.praxis_role),
    case
      when target.role in ('admin','procurador') then 'team'
      when target.role::text in ('estagiario','consulta') or target.role is null then 'none'
      else coalesce(target.efficiency_access, 'own')
    end::text,
    case
      when target.role in ('admin','procurador') then 'team'
      when target.role::text in ('estagiario','consulta') or target.role is null then 'none'
      else coalesce(target.reports_access, 'own')
    end::text
  from known_users ku
  join public.profiles p on p.id = ku.user_id
  join auth.users u on u.id = ku.user_id
  left join public.workspace_members target
    on target.workspace_id = target_workspace and target.user_id = ku.user_id
  order by p.full_name collate "C";
end
$$;

create or replace function public.set_workspace_member_v01080(
  target_workspace uuid,
  target_user uuid,
  new_enabled boolean,
  new_role text,
  new_efficiency_access text,
  new_reports_access text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role text;
  normalized_efficiency text;
  normalized_reports text;
begin
  if not public.is_workspace_admin(target_workspace) then
    raise exception 'Apenas o administrador desta Procuradoria pode alterar seus integrantes.';
  end if;
  if not exists(select 1 from public.profiles where id = target_user) then
    raise exception 'Usuário não encontrado.';
  end if;
  if new_role not in ('procurador','assessor','estagiario','consulta') then
    raise exception 'Perfil inválido para vínculo entre Procuradorias.';
  end if;
  if new_efficiency_access not in ('none','own','team') or new_reports_access not in ('none','own','team') then
    raise exception 'Escopo de acesso inválido.';
  end if;

  select wm.role::text into existing_role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace and wm.user_id = target_user;

  if existing_role = 'admin' then
    raise exception 'O vínculo de administrador não pode ser removido ou rebaixado por esta tela.';
  end if;
  if target_user = auth.uid() and not new_enabled then
    raise exception 'Você não pode remover o próprio acesso à Procuradoria.';
  end if;

  normalized_efficiency := case
    when new_role = 'procurador' then 'team'
    when new_role in ('estagiario','consulta') then 'none'
    else new_efficiency_access
  end;
  normalized_reports := case
    when new_role = 'procurador' then 'team'
    when new_role in ('estagiario','consulta') then 'none'
    else new_reports_access
  end;

  if new_enabled then
    insert into public.workspace_members(
      workspace_id, user_id, role, active, mfa_required,
      efficiency_access, reports_access, historico_disponivel_desde
    ) values(
      target_workspace, target_user, new_role::public.praxis_role, true, false,
      normalized_efficiency, normalized_reports, null
    )
    on conflict(workspace_id, user_id) do update set
      role = excluded.role,
      active = true,
      efficiency_access = excluded.efficiency_access,
      reports_access = excluded.reports_access;
  else
    update public.workspace_members
       set active = false
     where workspace_id = target_workspace and user_id = target_user and role <> 'admin';
  end if;

  -- Mantém o current_workspace_id válido quando um vínculo é criado ou removido.
  if new_enabled then
    update public.profiles
       set current_workspace_id = coalesce(current_workspace_id, target_workspace)
     where id = target_user;
  else
    update public.profiles p
       set current_workspace_id = (
         select wm.workspace_id
         from public.workspace_members wm
         where wm.user_id = target_user and wm.active
         order by wm.created_at, wm.workspace_id
         limit 1
       )
     where p.id = target_user and p.current_workspace_id = target_workspace;
  end if;

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values(target_workspace, auth.uid(), 'workspace_member_link_changed', jsonb_build_object(
    'target_user', target_user,
    'enabled', new_enabled,
    'role', new_role,
    'efficiency_access', normalized_efficiency,
    'reports_access', normalized_reports
  ));
end
$$;

-- ============================================================
-- 3. TRANSFERÊNCIA ADMINISTRATIVA DE PROCESSOS
-- ============================================================

create or replace function public.transfer_movement_v01080(
  target_movement bigint,
  target_workspace uuid,
  target_assignee uuid,
  transfer_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_workspace uuid;
  source_workspace_name text;
  target_workspace_name text;
  source_movement public.movements%rowtype;
  source_case public.cases%rowtype;
  destination_case bigint;
  reason_value text := trim(coalesce(transfer_reason, ''));
begin
  select p.current_workspace_id into source_workspace
  from public.profiles p where p.id = auth.uid();

  if source_workspace is null or not public.is_workspace_admin(source_workspace) then
    raise exception 'A transferência exige perfil de administrador na Procuradoria de origem.';
  end if;
  if target_workspace = source_workspace then
    raise exception 'A Procuradoria de destino deve ser diferente da unidade atual.';
  end if;
  if not public.is_workspace_admin(target_workspace) then
    raise exception 'A transferência exige perfil de administrador também na Procuradoria de destino.';
  end if;
  if char_length(reason_value) < 3 then
    raise exception 'Informe uma justificativa para a transferência.';
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = target_assignee
      and wm.active
      and wm.role::text in ('admin','procurador','assessor','estagiario')
  ) then
    raise exception 'O novo responsável precisa possuir perfil operacional ativo na Procuradoria de destino.';
  end if;

  select * into source_movement
  from public.movements
  where id = target_movement and workspace_id = source_workspace
  for update;
  if source_movement.id is null then raise exception 'Processo não encontrado na Procuradoria atual.'; end if;

  select * into source_case from public.cases where id = source_movement.case_id;
  if source_case.id is null then raise exception 'Cadastro processual vinculado não encontrado.'; end if;

  select id into destination_case
  from public.cases
  where workspace_id = target_workspace and judicial_number = source_case.judicial_number
  limit 1;

  if destination_case is null then
    insert into public.cases(
      workspace_id, mp_number, judicial_number, class_name, subject,
      socially_relevant, extremely_complex, social_theme, relevance_reason,
      fundamental_right, affected_group, reach, territorial_scope, impact_type,
      social_result, sdgs, complexity_reason, created_by, updated_by
    ) values(
      target_workspace, source_case.mp_number, source_case.judicial_number,
      source_case.class_name, source_case.subject, source_case.socially_relevant,
      source_case.extremely_complex, source_case.social_theme, source_case.relevance_reason,
      source_case.fundamental_right, source_case.affected_group, source_case.reach,
      source_case.territorial_scope, source_case.impact_type, source_case.social_result,
      source_case.sdgs, source_case.complexity_reason, auth.uid(), auth.uid()
    ) returning id into destination_case;
  end if;

  select name into source_workspace_name from public.workspaces where id = source_workspace;
  select name into target_workspace_name from public.workspaces where id = target_workspace;

  update public.movements
     set workspace_id = target_workspace,
         case_id = destination_case,
         assigned_to = target_assignee,
         updated_by = auth.uid(),
         updated_at = now()
   where id = target_movement and workspace_id = source_workspace;

  insert into public.change_history(
    workspace_id, movement_id, changed_by, action_name,
    field_name, old_value, new_value
  ) values(
    target_workspace, target_movement, auth.uid(), 'Transferência de Procuradoria',
    'Procuradoria',
    coalesce(source_workspace_name, source_workspace::text) || ' | ' || reason_value,
    coalesce(target_workspace_name, target_workspace::text)
  );

  insert into public.admin_audit_log(workspace_id, actor_id, event_type, details)
  values
    (source_workspace, auth.uid(), 'movement_transferred_out', jsonb_build_object(
      'movement_id', target_movement, 'judicial_number', source_case.judicial_number,
      'target_workspace', target_workspace, 'target_assignee', target_assignee,
      'reason', reason_value
    )),
    (target_workspace, auth.uid(), 'movement_transferred_in', jsonb_build_object(
      'movement_id', target_movement, 'judicial_number', source_case.judicial_number,
      'source_workspace', source_workspace, 'target_assignee', target_assignee,
      'reason', reason_value
    ));
end
$$;

-- ============================================================
-- 4. RLS — DADOS OPERACIONAIS SEMPRE LIMITADOS À UNIDADE ATIVA
-- ============================================================

-- Processos
 drop policy if exists cases_select_member on public.cases;
 drop policy if exists cases_insert_writer on public.cases;
 drop policy if exists cases_update_writer on public.cases;
 drop policy if exists cases_delete_admin on public.cases;
 drop policy if exists cases_select_current_v01080 on public.cases;
 create policy cases_select_current_v01080 on public.cases for select
   using(public.is_current_workspace_v01080(workspace_id) and public.can_view_case_v09(workspace_id, id));
 drop policy if exists cases_insert_current_v01080 on public.cases;
 create policy cases_insert_current_v01080 on public.cases for insert
   with check(public.is_current_workspace_v01080(workspace_id) and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor'));
 drop policy if exists cases_update_current_v01080 on public.cases;
 create policy cases_update_current_v01080 on public.cases for update
   using(public.is_current_workspace_v01080(workspace_id) and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor'))
   with check(public.is_current_workspace_v01080(workspace_id) and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor'));
 drop policy if exists cases_delete_current_v01080 on public.cases;
 create policy cases_delete_current_v01080 on public.cases for delete
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

-- Movimentações
 drop policy if exists movements_select_member on public.movements;
 drop policy if exists movements_insert_writer on public.movements;
 drop policy if exists movements_update_writer on public.movements;
 drop policy if exists movements_delete_admin on public.movements;
 drop policy if exists movements_delete_writer on public.movements;
 drop policy if exists movements_select_current_v01080 on public.movements;
 create policy movements_select_current_v01080 on public.movements for select
   using(public.is_current_workspace_v01080(workspace_id)
     and public.is_workspace_member(workspace_id)
     and (public.current_workspace_role(workspace_id) <> 'estagiario' or assigned_to = auth.uid()));
 drop policy if exists movements_insert_current_v01080 on public.movements;
 create policy movements_insert_current_v01080 on public.movements for insert
   with check(public.is_current_workspace_v01080(workspace_id) and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor'));
 drop policy if exists movements_update_current_v01080 on public.movements;
 create policy movements_update_current_v01080 on public.movements for update
   using(public.is_current_workspace_v01080(workspace_id)
     and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor','estagiario'))
   with check(public.is_current_workspace_v01080(workspace_id)
     and public.current_workspace_role(workspace_id) in ('admin','procurador','assessor','estagiario'));
 drop policy if exists movements_delete_current_v01080 on public.movements;
 create policy movements_delete_current_v01080 on public.movements for delete
   using(public.is_current_workspace_v01080(workspace_id) and public.can_write_workspace(workspace_id));

-- Classes
 drop policy if exists classes_select_member on public.class_settings;
 drop policy if exists classes_insert_writer on public.class_settings;
 drop policy if exists classes_update_writer on public.class_settings;
 drop policy if exists classes_delete_admin on public.class_settings;
 drop policy if exists classes_insert_admin on public.class_settings;
 drop policy if exists classes_update_admin on public.class_settings;
 drop policy if exists classes_admin_all on public.class_settings;
 drop policy if exists classes_select_current_v01080 on public.class_settings;
 create policy classes_select_current_v01080 on public.class_settings for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_member(workspace_id));
 drop policy if exists classes_admin_current_v01080 on public.class_settings;
 create policy classes_admin_current_v01080 on public.class_settings for all
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id))
   with check(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

-- Calendário
 drop policy if exists calendar_select_member on public.calendar_exclusions;
 drop policy if exists calendar_insert_writer on public.calendar_exclusions;
 drop policy if exists calendar_update_writer on public.calendar_exclusions;
 drop policy if exists calendar_delete_writer on public.calendar_exclusions;
 drop policy if exists calendar_insert_admin on public.calendar_exclusions;
 drop policy if exists calendar_update_admin on public.calendar_exclusions;
 drop policy if exists calendar_delete_admin on public.calendar_exclusions;
 drop policy if exists calendar_admin_all on public.calendar_exclusions;
 drop policy if exists calendar_select_current_v01080 on public.calendar_exclusions;
 create policy calendar_select_current_v01080 on public.calendar_exclusions for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_member(workspace_id));
 drop policy if exists calendar_admin_current_v01080 on public.calendar_exclusions;
 create policy calendar_admin_current_v01080 on public.calendar_exclusions for all
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id))
   with check(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

-- Histórico
 drop policy if exists history_select_member on public.change_history;
 drop policy if exists history_insert_writer on public.change_history;
 drop policy if exists history_select_current_v01080 on public.change_history;
 create policy history_select_current_v01080 on public.change_history for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_member(workspace_id));
 drop policy if exists history_insert_current_v01080 on public.change_history;
 create policy history_insert_current_v01080 on public.change_history for insert
   with check(public.is_current_workspace_v01080(workspace_id) and public.can_write_workspace(workspace_id));

-- Configurações e períodos fechados
 drop policy if exists workspace_settings_select_member on public.workspace_settings;
 drop policy if exists workspace_settings_write_admin on public.workspace_settings;
 drop policy if exists workspace_settings_select_current_v01080 on public.workspace_settings;
 create policy workspace_settings_select_current_v01080 on public.workspace_settings for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_member(workspace_id));
 drop policy if exists workspace_settings_admin_current_v01080 on public.workspace_settings;
 create policy workspace_settings_admin_current_v01080 on public.workspace_settings for all
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id))
   with check(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

 drop policy if exists closed_periods_select_member on public.closed_periods;
 drop policy if exists closed_periods_write_admin on public.closed_periods;
 drop policy if exists closed_periods_select_current_v01080 on public.closed_periods;
 create policy closed_periods_select_current_v01080 on public.closed_periods for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_member(workspace_id));
 drop policy if exists closed_periods_admin_current_v01080 on public.closed_periods;
 create policy closed_periods_admin_current_v01080 on public.closed_periods for all
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id))
   with check(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

-- Auditoria administrativa também acompanha a Procuradoria ativa nas leituras diretas.
 drop policy if exists admin_audit_select_admin on public.admin_audit_log;
 drop policy if exists admin_audit_select_current_v01080 on public.admin_audit_log;
 create policy admin_audit_select_current_v01080 on public.admin_audit_log for select
   using(public.is_current_workspace_v01080(workspace_id) and public.is_workspace_admin(workspace_id));

-- ============================================================
-- 5. PERMISSÕES DAS RPCs
-- ============================================================

revoke execute on function public.is_current_workspace_v01080(uuid) from public, anon;
revoke execute on function public.list_admin_workspaces_v01080() from public, anon;
revoke execute on function public.create_workspace_v01080(text, boolean) from public, anon;
revoke execute on function public.rename_workspace_v01080(uuid, text) from public, anon;
revoke execute on function public.list_workspace_directory_v01080(uuid) from public, anon;
revoke execute on function public.set_workspace_member_v01080(uuid, uuid, boolean, text, text, text) from public, anon;
revoke execute on function public.transfer_movement_v01080(bigint, uuid, uuid, text) from public, anon;

grant execute on function public.is_current_workspace_v01080(uuid) to authenticated;
grant execute on function public.list_my_workspaces_v01079() to authenticated;
grant execute on function public.set_current_workspace_v01079(uuid) to authenticated;
grant execute on function public.list_admin_workspaces_v01080() to authenticated;
grant execute on function public.create_workspace_v01080(text, boolean) to authenticated;
grant execute on function public.rename_workspace_v01080(uuid, text) to authenticated;
grant execute on function public.list_workspace_directory_v01080(uuid) to authenticated;
grant execute on function public.set_workspace_member_v01080(uuid, uuid, boolean, text, text, text) to authenticated;
grant execute on function public.transfer_movement_v01080(bigint, uuid, uuid, text) to authenticated;

commit;

-- Validação rápida (somente leitura):
select p.current_workspace_id, w.name as current_workspace_name
from public.profiles p left join public.workspaces w on w.id = p.current_workspace_id
where p.id = auth.uid();
