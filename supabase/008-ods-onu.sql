-- Práxis Online — Objetivos de Desenvolvimento Sustentável da ONU
-- Execute uma única vez após 007-usuarios-distribuicao-auditoria.sql.

alter table public.cases
  add column if not exists sdgs text[] not null default '{}'::text[];

comment on column public.cases.sdgs is
  'Um ou mais Objetivos de Desenvolvimento Sustentável da ONU associados ao processo socialmente relevante.';

