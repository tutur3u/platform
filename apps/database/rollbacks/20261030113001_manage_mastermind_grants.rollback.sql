-- Rollback for 20261030113001_manage_mastermind_grants.sql.
--
-- Fails closed: every manage_mastermind grant is removed before the guards go,
-- so no role or member holds it afterwards. Postgres cannot drop an enum
-- value, so 'manage_mastermind' stays in public.workspace_role_permission as
-- an ungranted label, and has_workspace_permission keeps denying it outright
-- so a creator or admin never inherits it once the guards are gone. The
-- dedicated Mastermind role, its members and its id record are removed, so a
-- re-apply starts with no role and no member to re-admit. The audit
-- table is kept as evidence: it is private, RLS-enabled and revoked from every
-- API role. Grants nothing to anon or PUBLIC.
-- Drops both the conflict-aware grant guard and the owner-session grant fence;
-- re-applying the forward migration restores them without granting access.

BEGIN;

DELETE FROM public.workspace_role_permissions
WHERE permission::text = 'manage_mastermind';

DELETE FROM public.workspace_default_permissions
WHERE permission::text = 'manage_mastermind';

DROP TRIGGER IF EXISTS guard_mastermind_role_permission
  ON public.workspace_role_permissions;
DROP TRIGGER IF EXISTS guard_mastermind_default_permission
  ON public.workspace_default_permissions;
DROP TRIGGER IF EXISTS guard_mastermind_role_member
  ON public.workspace_role_members;
DROP TRIGGER IF EXISTS guard_mastermind_access_role
  ON public.workspace_roles;

DELETE FROM public.workspace_role_members
WHERE role_id IN (SELECT role_id FROM private.mastermind_access_role);
DELETE FROM public.workspace_role_permissions
WHERE role_id IN (SELECT role_id FROM private.mastermind_access_role);
WITH removed AS (DELETE FROM private.mastermind_access_role RETURNING role_id)
DELETE FROM public.workspace_roles WHERE id IN (SELECT role_id FROM removed);


DROP TABLE IF EXISTS private.mastermind_access_role;

DROP FUNCTION IF EXISTS private.grant_mastermind_access(uuid, text);
DROP FUNCTION IF EXISTS private.revoke_mastermind_access(uuid, text);
DROP FUNCTION IF EXISTS private.guard_mastermind_role_permission();
DROP FUNCTION IF EXISTS private.guard_mastermind_default_permission();
DROP FUNCTION IF EXISTS private.guard_mastermind_role_member();
DROP FUNCTION IF EXISTS private.guard_mastermind_access_role();
DROP FUNCTION IF EXISTS private.mastermind_grant_allowed();

COMMIT;
