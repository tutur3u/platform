CREATE POLICY "Allow users with manage_users to view all groups"
ON "public"."workspace_user_groups"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_users')
);
