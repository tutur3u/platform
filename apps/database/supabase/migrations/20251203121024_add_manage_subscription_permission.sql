CREATE OR REPLACE FUNCTION public.check_ws_creator(ws_id uuid, user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.workspaces WHERE id = check_ws_creator.ws_id
      AND creator_id = check_ws_creator.user_id
    )
  );
END;$function$
;

-- Add manage_subscription permission to workspace_role_permission enum
-- This permission controls who can manage workspace subscriptions
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_subscription';

-- Drop existing RLS policies on workspace_subscription
DROP POLICY IF EXISTS "allow workspace members to view subscriptions" ON "public"."workspace_subscription";
DROP POLICY IF EXISTS "allow workspace owner to create subscriptions" ON "public"."workspace_subscription";
DROP POLICY IF EXISTS "allow workspace owner to edit subscriptions" ON "public"."workspace_subscription";
DROP POLICY IF EXISTS "allow workspace owner to delete subscriptions" ON "public"."workspace_subscription";

-- Create new permission-based RLS policies using has_workspace_permission

-- SELECT: Allow workspace creators or users with manage_subscription permission to view subscriptions
CREATE POLICY "allow users to view subscriptions"
ON "public"."workspace_subscription"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- INSERT: Allow workspace creators or users with manage_subscription permission to create subscriptions
CREATE POLICY "allow users to create subscriptions"
ON "public"."workspace_subscription"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- UPDATE: Allow workspace creators or users with manage_subscription permission to edit subscriptions
CREATE POLICY "allow users to edit subscriptions"
ON "public"."workspace_subscription"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);

-- DELETE: Allow workspace creators or users with manage_subscription permission to delete subscriptions
CREATE POLICY "allow users to delete subscriptions"
ON "public"."workspace_subscription"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    ws_id,
    auth.uid(),
    'manage_subscription'
  )
);
