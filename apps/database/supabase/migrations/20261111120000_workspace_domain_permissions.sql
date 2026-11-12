-- Workspace custom domains: view_workspace_domains reads a workspace's domain
-- bindings and entitlement; manage_workspace_domains adds, verifies and
-- removes them. Workspace creators and admins hold both through
-- has_workspace_permission. 20261111120100 uses them in its policies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The new values are only read at run time (has_workspace_permission casts
-- its text argument), never inside this transaction.
ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'view_workspace_domains';
ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_workspace_domains';

COMMIT;
