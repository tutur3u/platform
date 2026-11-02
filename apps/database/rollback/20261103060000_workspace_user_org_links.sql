BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP TABLE public.workspace_user_org_links;
DROP FUNCTION private.guard_workspace_user_org_link();
COMMIT;
