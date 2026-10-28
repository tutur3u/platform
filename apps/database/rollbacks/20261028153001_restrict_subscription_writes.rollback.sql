-- Manual rollback only: restores the API write policies and grants on
-- workspace_subscriptions and workspace_orders as they were before
-- 20261028153001, and removes the manage_subscription grant guards.
BEGIN;

DROP TRIGGER IF EXISTS guard_creator_grant_role_permission
  ON public.workspace_role_permissions;
DROP TRIGGER IF EXISTS guard_creator_grant_default_permission
  ON public.workspace_default_permissions;
DROP TRIGGER IF EXISTS guard_creator_grant_role_member
  ON public.workspace_role_members;
DROP FUNCTION IF EXISTS private.guard_creator_grant_role_permission();
DROP FUNCTION IF EXISTS private.guard_creator_grant_default_permission();
DROP FUNCTION IF EXISTS private.guard_creator_grant_role_member();

GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_subscriptions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_orders TO anon, authenticated;

CREATE POLICY "allow users to create subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
CREATE POLICY "allow users to edit subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
CREATE POLICY "allow users to delete subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

CREATE POLICY "allow users to create orders"
  ON public.workspace_orders AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
CREATE POLICY "allow users to update orders"
  ON public.workspace_orders AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
CREATE POLICY "allow users to delete orders"
  ON public.workspace_orders AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

COMMIT;
