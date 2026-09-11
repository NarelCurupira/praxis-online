-- PRÁXIS WEB 0.10.6
-- Execute este arquivo integralmente no SQL Editor do Supabase antes ou logo
-- após publicar o novo código. A execução é idempotente e pode ser repetida.

begin;

create index if not exists movements_workspace_active_received_id_idx
  on public.movements(workspace_id, received_at desc, id desc)
  where deleted_at is null;

create index if not exists workspace_members_user_active_workspace_idx
  on public.workspace_members(user_id, workspace_id)
  where active;

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

  update public.movements
     set action_type = coalesce(new_action_type, ''),
         updated_by = auth.uid(),
         updated_at = now()
   where id = target_movement
     and workspace_id = target_workspace;

  insert into public.change_history(
    workspace_id, movement_id, changed_by, field_name, old_value, new_value
  )
  values(
    target_workspace, target_movement, auth.uid(), 'Providência',
    coalesce(old_action_type, ''), coalesce(new_action_type, '')
  );
end;
$$;

revoke all on function public.update_movement_action_v0106(bigint, text) from public;
grant execute on function public.update_movement_action_v0106(bigint, text) to authenticated;

commit;
