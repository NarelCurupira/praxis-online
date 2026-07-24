-- Práxis Web 0.8.1 — correção definitiva
-- Corrige a perda do horário de entrada causada por movements.received_at do tipo date.
-- Execute uma única vez no SQL Editor do Supabase.

begin;

do $$
declare
  current_type text;
begin
  select data_type
    into current_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'movements'
     and column_name = 'received_at';

  if current_type = 'date' then
    execute $sql$
      alter table public.movements
      alter column received_at type timestamptz
      using (received_at::timestamp at time zone 'America/Belem')
    $sql$;
  elsif current_type <> 'timestamp with time zone' then
    raise exception 'Tipo inesperado em movements.received_at: %', current_type;
  end if;
end $$;

comment on column public.movements.received_at is
  'Instante real de entrada do processo. Registros antigos sem horário foram migrados para 00:00 no fuso America/Belem.';

commit;
