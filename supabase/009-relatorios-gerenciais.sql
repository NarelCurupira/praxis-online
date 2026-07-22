-- Práxis Web 0.7.0 - suporte metodológico aos relatórios gerenciais
-- Execute uma única vez após 008-ods-onu.sql.

-- A ausência de data passa a representar explicitamente "sem prazo aplicável".
-- Nenhum prazo histórico é alterado.
alter table public.movements alter column deadline_at drop not null;

comment on column public.movements.deadline_at is
  'Prazo aplicável à movimentação; NULL significa que não há prazo aplicável.';
