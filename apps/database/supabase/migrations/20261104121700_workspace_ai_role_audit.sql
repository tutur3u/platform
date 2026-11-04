BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Track role grants and assignments used by the personal education AI fence.
-- Shared audit machinery records actor, operation, and old/new row versions.
SELECT audit.enable_tracking('public.workspace_role_permissions'::regclass);
SELECT audit.enable_tracking('public.workspace_role_members'::regclass);

COMMIT;
