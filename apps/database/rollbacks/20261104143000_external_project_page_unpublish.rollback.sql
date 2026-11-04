BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP FUNCTION public.unpublish_workspace_external_project_page(uuid, uuid, uuid);
COMMIT;
