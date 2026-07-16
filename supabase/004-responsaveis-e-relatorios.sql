-- Práxis Online 0.3.0 — responsáveis, fila individual e relatório da equipe
-- Execute após 003-corrigir-convites-pgcrypto.sql.

alter table public.movements
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

update public.movements
set assigned_to = created_by
where assigned_to is null;

create index if not exists movements_workspace_assigned_idx
  on public.movements(workspace_id, assigned_to, workflow_status, received_at desc);

create or replace function public.protect_movement_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' and new.assigned_to is null then new.assigned_to := actor; end if;
  if new.assigned_to is null then raise exception 'O processo precisa ter um responsável'; end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = new.workspace_id and user_id = new.assigned_to and active
  ) then raise exception 'O responsável deve ser um usuário ativo desta equipe'; end if;
  if actor is not null and new.assigned_to <> actor and not public.is_workspace_admin(new.workspace_id) then
    raise exception 'Somente o administrador pode atribuir processos a outro usuário';
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to
     and actor is not null and not public.is_workspace_admin(new.workspace_id) then
    raise exception 'Somente o administrador pode alterar o responsável';
  end if;
  return new;
end $$;

drop trigger if exists protect_movement_assignment_trigger on public.movements;
create trigger protect_movement_assignment_trigger
before insert or update of assigned_to on public.movements
for each row execute function public.protect_movement_assignment();

create or replace function public.team_comparative_report(period_start date, period_end date)
returns table(
  user_id uuid, full_name text, email text, role public.praxis_role,
  received_count bigint, sent_count bigint, pending_count bigint,
  on_time_count bigint, average_hours numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare target_workspace uuid;
begin
  select current_workspace_id into target_workspace from public.profiles where id = auth.uid();
  if target_workspace is null or not public.is_workspace_admin(target_workspace) then
    raise exception 'Relatório disponível somente para o administrador';
  end if;
  return query
  select wm.user_id, p.full_name, coalesce(u.email, ''), wm.role,
    count(m.id) filter (where m.received_at::date between period_start and period_end),
    count(m.id) filter (where m.received_at::date between period_start and period_end and m.workflow_status = 'Enviado'),
    count(m.id) filter (where m.received_at::date between period_start and period_end and m.workflow_status <> 'Enviado'),
    count(m.id) filter (where m.received_at::date between period_start and period_end and m.workflow_status = 'Enviado' and m.sent_at is not null and m.sent_at <= m.deadline_at),
    round(avg(m.elapsed_hours) filter (where m.received_at::date between period_start and period_end and m.workflow_status = 'Enviado'), 1)
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  left join public.movements m on m.workspace_id = wm.workspace_id and m.assigned_to = wm.user_id and m.deleted_at is null
  where wm.workspace_id = target_workspace and wm.active
  group by wm.user_id, p.full_name, u.email, wm.role
  order by count(m.id) filter (where m.received_at::date between period_start and period_end) desc, p.full_name;
end $$;
