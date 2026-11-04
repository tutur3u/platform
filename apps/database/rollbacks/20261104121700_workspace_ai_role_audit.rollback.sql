BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Remove only the tracking introduced by this migration; retain audit history.
SELECT audit.disable_tracking('public.workspace_role_permissions'::regclass);
SELECT audit.disable_tracking('public.workspace_role_members'::regclass);

COMMIT;
