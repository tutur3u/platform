-- Update has_workspace_permission function to grant all permissions to workspace creators
-- This ensures that users who created a workspace automatically have all permissions

set check_function_bodies = off;

create or replace function public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  -- First check if user is the workspace creator
  -- If so, they automatically have all permissions
  if exists (
    select 1
    from workspaces
    where id = p_ws_id
      and creator_id = p_user_id
  ) then
    return true;
  end if;

  -- Otherwise, check role-based and default permissions as before
  return exists (
    -- Check if user has permission via role membership
    select 1
    from workspace_role_members wrm
    join workspace_role_permissions wrp
      on wrp.role_id = wrm.role_id
      and wrp.ws_id = p_ws_id
    where wrm.user_id = p_user_id
      and wrp.permission = p_permission::"public"."workspace_role_permission"
      and wrp.enabled = true

    union

    -- Also check workspace-wide default permissions
    select 1
    from workspace_default_permissions wdp
    where wdp.ws_id = p_ws_id
      and wdp.permission = p_permission::"public"."workspace_role_permission"
      and wdp.enabled = true
  );
end;
$$;

-- Update comment to reflect the creator check
comment on function public.has_workspace_permission(uuid, uuid, text) is
  'Checks if a user has a specific permission in a workspace. Workspace creators automatically have all permissions. For other users, checks both role-based permissions and workspace-wide default permissions.';
