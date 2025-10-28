-- Create a dedicated RPC function to check if a user has a specific permission in a workspace
-- This function checks both role-based permissions and workspace-wide default permissions
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

-- Grant execute permission to authenticated users
grant execute on function public.has_workspace_permission(uuid, uuid, text) to authenticated;

-- Add helpful comment
comment on function public.has_workspace_permission(uuid, uuid, text) is
  'Checks if a user has a specific permission in a workspace by examining both role-based permissions and workspace-wide default permissions';
