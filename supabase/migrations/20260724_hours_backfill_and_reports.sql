-- Práxis Web 0.8.2
-- Preserva e importa horários, permite completar registros antigos e corrige
-- a cobertura histórica usada nos relatórios.

begin;

-- O trigger existente depende de received_at e precisa ser removido antes
-- de qualquer conversão de tipo.
drop trigger if exists default_missing_sent_at_trigger on public.movements;

do $$
declare current_type text;
begin
  select data_type into current_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'movements' and column_name = 'received_at';

  if current_type = 'date' then
    alter table public.movements
      alter column received_at type timestamptz
      using (received_at::timestamp at time zone 'America/Belem');
  elsif current_type <> 'timestamp with time zone' then
    raise exception 'Tipo inesperado em public.movements.received_at: %', current_type;
  end if;
end $$;

alter table public.movements
  add column if not exists received_time_precise boolean not null default false,
  add column if not exists sent_time_precise boolean not null default false;

-- Registros antigos migrados de DATE ficaram à meia-noite. Horários diferentes
-- de 00:00 são considerados preservados; os demais poderão ser completados por
-- reimportação ou edição manual.
update public.movements
   set received_time_precise = ((received_at at time zone 'America/Belem')::time <> time '00:00:00')
 where received_time_precise = false;

update public.movements
   set sent_time_precise = sent_at is not null
       and ((sent_at at time zone 'America/Belem')::time <> time '00:00:00')
 where sent_time_precise = false;

create or replace function public.default_missing_sent_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.workflow_status = 'Enviado' and new.sent_at is null then
    new.sent_at := new.received_at + interval '10 days';
    new.sent_time_precise := false;
  end if;
  return new;
end $$;

create trigger default_missing_sent_at_trigger
before insert or update of workflow_status, sent_at, received_at on public.movements
for each row execute function public.default_missing_sent_at();

-- Completa a cobertura histórica dos membros a partir da primeira movimentação
-- efetivamente existente. Isso elimina a prévia de relatório zerada quando um
-- único integrante possuía historico_disponivel_desde configurado.
update public.workspace_members wm
   set historico_disponivel_desde = least(
     coalesce(wm.historico_disponivel_desde, first_movement.first_date),
     first_movement.first_date
   )
  from (
    select workspace_id, assigned_to,
           min((received_at at time zone 'America/Belem')::date) as first_date
      from public.movements
     where assigned_to is not null and deleted_at is null
     group by workspace_id, assigned_to
  ) first_movement
 where wm.workspace_id = first_movement.workspace_id
   and wm.user_id = first_movement.assigned_to;

create or replace function public.sync_member_historical_coverage()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.assigned_to is not null then
    update public.workspace_members
       set historico_disponivel_desde = least(
         coalesce(historico_disponivel_desde, (new.received_at at time zone 'America/Belem')::date),
         (new.received_at at time zone 'America/Belem')::date
       )
     where workspace_id = new.workspace_id and user_id = new.assigned_to;
  end if;
  return new;
end $$;

drop trigger if exists sync_member_historical_coverage_trigger on public.movements;
create trigger sync_member_historical_coverage_trigger
after insert or update of assigned_to, received_at on public.movements
for each row execute function public.sync_member_historical_coverage();

comment on column public.movements.received_time_precise is
  'Verdadeiro quando o horário de entrada foi informado ou confirmado.';
comment on column public.movements.sent_time_precise is
  'Verdadeiro quando o horário de envio foi informado ou confirmado.';

commit;

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'movements'
   and column_name in ('received_at', 'received_time_precise', 'sent_time_precise')
 order by column_name;
