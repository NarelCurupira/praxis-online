-- Práxis Web 0.10.6 — índices e atualização transacional de providência
begin;

-- Atende ao filtro e à ordenação usados na carga principal de movimentações.
-- O índice parcial não inclui itens da lixeira.
create index if not exists movements_workspace_active_received_id_idx
  on public.movements(workspace_id, received_at desc, id desc)
  where deleted_at is null;

-- Acelera a resolução alternativa do workspace e consultas de associações
-- ativas iniciadas pelo usuário.
create index if not exists workspace_members_user_active_workspace_idx
  on public.workspace_members(user_id, workspace_id)
  where active;

-- Reúne leitura, atualização e histórico em uma única viagem ao Supabase.
-- As regras de perfil, atribuição e período fechado continuam aplicadas.
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
