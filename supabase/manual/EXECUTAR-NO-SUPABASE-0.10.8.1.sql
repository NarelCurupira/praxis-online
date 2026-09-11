-- Práxis Online 0.10.8.1 — salvamento transacional de vínculos
begin;

create or replace function public.set_workspace_members_batch_v01081(target_workspace uuid, members_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb; changed integer := 0; r text; eff text; rep text; target_user uuid; enabled boolean;
begin
  if not public.is_workspace_admin(target_workspace) then raise exception 'Apenas o administrador desta Procuradoria pode alterar seus integrantes.'; end if;
  if jsonb_typeof(members_payload) <> 'array' then raise exception 'Lista de integrantes inválida.'; end if;
  for item in select value from jsonb_array_elements(members_payload) loop
    target_user := (item->>'user_id')::uuid; enabled := coalesce((item->>'enabled')::boolean,false); r := coalesce(item->>'role','consulta');
    if not exists(select 1 from public.profiles where id=target_user) then raise exception 'Usuário não encontrado.'; end if;
    if r not in ('procurador','assessor','estagiario','consulta','admin') then raise exception 'Perfil inválido.'; end if;
    if exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=target_user and role='admin') then continue; end if;
    if target_user=auth.uid() and not enabled then raise exception 'Você não pode remover o próprio acesso à Procuradoria.'; end if;
    eff := case when r='procurador' then 'team' when r in ('estagiario','consulta') then 'none' else coalesce(item->>'efficiency_access','own') end;
    rep := case when r='procurador' then 'team' when r in ('estagiario','consulta') then 'none' else coalesce(item->>'reports_access','own') end;
    if eff not in ('none','own','team') or rep not in ('none','own','team') then raise exception 'Escopo de acesso inválido.'; end if;
    if enabled then
      insert into public.workspace_members(workspace_id,user_id,role,active,mfa_required,efficiency_access,reports_access)
      values(target_workspace,target_user,r::public.praxis_role,true,false,eff,rep)
      on conflict(workspace_id,user_id) do update set role=excluded.role,active=true,efficiency_access=excluded.efficiency_access,reports_access=excluded.reports_access;
      update public.profiles set current_workspace_id=coalesce(current_workspace_id,target_workspace) where id=target_user;
    else
      update public.workspace_members set active=false where workspace_id=target_workspace and user_id=target_user and role<>'admin';
      update public.profiles p set current_workspace_id=(select wm.workspace_id from public.workspace_members wm where wm.user_id=target_user and wm.active order by wm.created_at,wm.workspace_id limit 1) where p.id=target_user and p.current_workspace_id=target_workspace;
    end if;
    changed := changed + 1;
  end loop;
  insert into public.admin_audit_log(workspace_id,actor_id,event_type,details) values(target_workspace,auth.uid(),'workspace_members_batch_changed',jsonb_build_object('records',changed));
  return changed;
end $$;

revoke execute on function public.set_workspace_members_batch_v01081(uuid,jsonb) from public,anon;
grant execute on function public.set_workspace_members_batch_v01081(uuid,jsonb) to authenticated;
commit;
