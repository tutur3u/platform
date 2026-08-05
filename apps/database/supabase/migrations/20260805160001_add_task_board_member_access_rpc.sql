create or replace function public.get_task_board_workspace_members(p_ws_id uuid)
returns table (
  user_id uuid, display_name text, email text, handle text, avatar_url text,
  is_creator boolean, workspace_member_type public.workspace_member_type,
  permission text, roles jsonb
)
language sql stable security definer set search_path = public, private
as $$
  select wm.user_id, u.display_name, upd.email, u.handle, u.avatar_url,
    w.creator_id = wm.user_id,
    wm.type,
    case when w.creator_id = wm.user_id or exists (
      select 1 from public.workspace_default_permissions dp
      where dp.ws_id = wm.ws_id and dp.member_type = wm.type and dp.enabled
        and dp.permission in ('admin', 'manage_projects')
    ) or exists (
      select 1 from public.workspace_role_members rm
      join public.workspace_roles wr on wr.id = rm.role_id and wr.ws_id = wm.ws_id
      join public.workspace_role_permissions rp on rp.role_id = wr.id and rp.ws_id = wm.ws_id
      where rm.user_id = wm.user_id and rp.enabled and rp.permission in ('admin', 'manage_projects')
    ) then 'edit' else 'view' end,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', scoped_roles.id, 'name', scoped_roles.name) order by scoped_roles.name, scoped_roles.id)
      from (
        select distinct wr.id, wr.name from public.workspace_role_members rm
        join public.workspace_roles wr on wr.id = rm.role_id and wr.ws_id = wm.ws_id
        where rm.user_id = wm.user_id
      ) scoped_roles
    ), '[]'::jsonb)
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.ws_id
  join public.users u on u.id = wm.user_id
  left join public.user_private_details upd on upd.user_id = wm.user_id
  where wm.ws_id = p_ws_id
  order by (w.creator_id = wm.user_id) desc, lower(coalesce(u.display_name, upd.email, wm.user_id::text));
$$;

revoke all on function public.get_task_board_workspace_members(uuid) from public;
grant execute on function public.get_task_board_workspace_members(uuid) to service_role;
comment on function public.get_task_board_workspace_members(uuid) is
  'Focused joined-member projection for task-board access UI. Service role only; callers must authorize board access.';
