-- Práxis Online 0.10.7.6
-- Prioridades processuais separadas da urgência interna da fila.

alter table public.movements
  add column if not exists procedural_priority text not null default 'Nenhuma';

alter table public.movements
  drop constraint if exists movements_procedural_priority_check;

alter table public.movements
  add constraint movements_procedural_priority_check
  check (procedural_priority in ('Nenhuma', 'Idoso', 'Idoso +80', 'ECA', 'Doença grave'));

create or replace function public.update_movement_v01076(
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
  old_priority text;
  new_priority text;
begin
  select workspace_id, procedural_priority
    into ws, old_priority
  from public.movements
  where id = target_movement and deleted_at is null;

  if ws is null then
    raise exception 'Processo não encontrado.';
  end if;

  actor_role := public.current_workspace_role(ws);
  new_priority := coalesce(nullif(payload->>'proceduralPriority', ''), 'Nenhuma');

  if new_priority not in ('Nenhuma', 'Idoso', 'Idoso +80', 'ECA', 'Doença grave') then
    raise exception 'Prioridade processual inválida.';
  end if;

  if new_priority is distinct from old_priority
     and actor_role not in ('admin', 'procurador', 'assessor') then
    raise exception 'Perfil sem permissão para alterar a prioridade processual.';
  end if;

  perform public.update_movement_v0107(target_movement, payload, change_reason);

  if new_priority is distinct from old_priority then
    update public.movements
       set procedural_priority = new_priority,
           updated_by = auth.uid(),
           updated_at = now()
     where id = target_movement;

    actor_label := public.process_actor_name_v0107();
    insert into public.change_history(
      workspace_id, movement_id, changed_by, actor_name, action_name,
      field_name, old_value, new_value
    ) values (
      ws, target_movement, auth.uid(), actor_label, 'Edição do processo',
      'Prioridade processual', coalesce(old_priority, 'Nenhuma'), new_priority
    );
  end if;
end;
$$;

revoke all on function public.update_movement_v01076(bigint, jsonb, text) from public;
grant execute on function public.update_movement_v01076(bigint, jsonb, text) to authenticated;
