-- Drop the old RLS policy that used get_user_role
drop policy if exists "Allow all for workspace admins and owners" on "public"."workspace_configs";

-- Create new RLS policy using has_workspace_permission RPC function
-- This policy checks if the user has the 'manage_user_report_templates' permission
create policy "Allow users with manage_user_report_templates permission"
on "public"."workspace_configs"
as permissive
for all
to authenticated
using (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_user_report_templates'
  )
)
with check (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_user_report_templates'
  )
);

-- Add comment for documentation
comment on policy "Allow users with manage_user_report_templates permission" on "public"."workspace_configs" is
  'Users must have the manage_user_report_templates permission in the workspace to perform any operation on workspace configs';
