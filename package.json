-- Práxis Online 0.4.0 — qualidade de dados, responsáveis e data de envio
-- Execute após 004-responsaveis-e-relatorios.sql.

-- Registros já concluídos sem data recebem a estimativa solicitada.
update public.movements
set sent_at = received_at::timestamptz + interval '10 days',
    elapsed_hours = 240,
    updated_at = now()
where workflow_status = 'Enviado'
  and sent_at is null;

create or replace function public.default_missing_sent_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.workflow_status = 'Enviado' and new.sent_at is null then
    new.sent_at := new.received_at::timestamptz + interval '10 days';
  end if;

  if new.sent_at is not null then
    new.elapsed_hours := greatest(
      0,
      extract(epoch from (new.sent_at - new.received_at::timestamptz)) / 3600
    );
  else
    new.elapsed_hours := null;
  end if;
  return new;
end $$;

drop trigger if exists default_missing_sent_at_trigger on public.movements;
create trigger default_missing_sent_at_trigger
before insert or update of workflow_status, sent_at, received_at on public.movements
for each row execute function public.default_missing_sent_at();
