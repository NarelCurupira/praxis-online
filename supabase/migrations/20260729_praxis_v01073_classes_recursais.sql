-- Práxis 0.10.7.3
-- Inclui as classes recursais ausentes sem alterar configurações já existentes.

insert into public.class_settings (workspace_id, name, business_days)
select workspace.id, required_class.name, required_class.business_days
from public.workspaces as workspace
cross join (
  values
    ('Recurso Especial'::text, 30),
    ('Recurso Extraordinário'::text, 30)
) as required_class(name, business_days)
on conflict (workspace_id, name) do nothing;
