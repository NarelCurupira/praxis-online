-- Práxis Online 0.10.8.2
-- Otimização do RLS multi-Procuradoria sem redução de isolamento.
-- O workspace e o papel ativos passam a ser resolvidos uma vez por statement
-- através de InitPlans nas policies, em vez de repetir buscas por linha.

begin;

create or replace function public.current_praxis_workspace_v01082()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.current_workspace_id
  from public.profiles p
  where p.id = auth.uid()
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p.current_workspace_id
        and wm.user_id = p.id
        and wm.active
    )
  limit 1
$$;

create or replace function public.current_praxis_role_v01082()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role::text
  from public.profiles p
  join public.workspace_members wm
    on wm.workspace_id = p.current_workspace_id
   and wm.user_id = p.id
   and wm.active
  where p.id = auth.uid()
  limit 1
$$;

-- PROCESSOS
 drop policy if exists cases_select_current_v01080 on public.cases;
 create policy cases_select_current_v01080 on public.cases for select
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (
     (select public.current_praxis_role_v01082()) <> 'estagiario'
     or exists (
       select 1 from public.movements qm
       where qm.workspace_id = cases.workspace_id
         and qm.case_id = cases.id
         and qm.assigned_to = (select auth.uid())
         and qm.deleted_at is null
     )
   )
 );

 drop policy if exists cases_insert_current_v01080 on public.cases;
 create policy cases_insert_current_v01080 on public.cases for insert
 with check (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor')
 );

 drop policy if exists cases_update_current_v01080 on public.cases;
 create policy cases_update_current_v01080 on public.cases for update
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor')
 )
 with check (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor')
 );

 drop policy if exists cases_delete_current_v01080 on public.cases;
 create policy cases_delete_current_v01080 on public.cases for delete
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) = 'admin'
 );

-- MOVIMENTAÇÕES
 drop policy if exists movements_select_current_v01080 on public.movements;
 create policy movements_select_current_v01080 on public.movements for select
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (
     (select public.current_praxis_role_v01082()) <> 'estagiario'
     or assigned_to = (select auth.uid())
   )
 );

 drop policy if exists movements_insert_current_v01080 on public.movements;
 create policy movements_insert_current_v01080 on public.movements for insert
 with check (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor')
 );

 drop policy if exists movements_update_current_v01080 on public.movements;
 create policy movements_update_current_v01080 on public.movements for update
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor','estagiario')
 )
 with check (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor','estagiario')
 );

 drop policy if exists movements_delete_current_v01080 on public.movements;
 create policy movements_delete_current_v01080 on public.movements for delete
 using (
   workspace_id = (select public.current_praxis_workspace_v01082())
   and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor')
 );

-- TABELAS DE REFERÊNCIA / GOVERNANÇA
 drop policy if exists classes_select_current_v01080 on public.class_settings;
 create policy classes_select_current_v01080 on public.class_settings for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()));
 drop policy if exists classes_admin_current_v01080 on public.class_settings;
 create policy classes_admin_current_v01080 on public.class_settings for all
 using (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin')
 with check (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin');

 drop policy if exists calendar_select_current_v01080 on public.calendar_exclusions;
 create policy calendar_select_current_v01080 on public.calendar_exclusions for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()));
 drop policy if exists calendar_admin_current_v01080 on public.calendar_exclusions;
 create policy calendar_admin_current_v01080 on public.calendar_exclusions for all
 using (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin')
 with check (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin');

 drop policy if exists history_select_current_v01080 on public.change_history;
 create policy history_select_current_v01080 on public.change_history for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()));
 drop policy if exists history_insert_current_v01080 on public.change_history;
 create policy history_insert_current_v01080 on public.change_history for insert
 with check (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) in ('admin','procurador','assessor'));

 drop policy if exists workspace_settings_select_current_v01080 on public.workspace_settings;
 create policy workspace_settings_select_current_v01080 on public.workspace_settings for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()));
 drop policy if exists workspace_settings_admin_current_v01080 on public.workspace_settings;
 create policy workspace_settings_admin_current_v01080 on public.workspace_settings for all
 using (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin')
 with check (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin');

 drop policy if exists closed_periods_select_current_v01080 on public.closed_periods;
 create policy closed_periods_select_current_v01080 on public.closed_periods for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()));
 drop policy if exists closed_periods_admin_current_v01080 on public.closed_periods;
 create policy closed_periods_admin_current_v01080 on public.closed_periods for all
 using (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin')
 with check (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin');

 drop policy if exists admin_audit_select_current_v01080 on public.admin_audit_log;
 create policy admin_audit_select_current_v01080 on public.admin_audit_log for select
 using (workspace_id = (select public.current_praxis_workspace_v01082()) and (select public.current_praxis_role_v01082()) = 'admin');

revoke execute on function public.current_praxis_workspace_v01082() from public, anon;
revoke execute on function public.current_praxis_role_v01082() from public, anon;
grant execute on function public.current_praxis_workspace_v01082() to authenticated;
grant execute on function public.current_praxis_role_v01082() to authenticated;

commit;

-- Validação de contexto (somente leitura)
select public.current_praxis_workspace_v01082() as workspace_ativo,
       public.current_praxis_role_v01082() as papel_ativo;
