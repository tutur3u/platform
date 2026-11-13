-- Manual rollback only: removes can_edit_workspace_external_projects. Roll
-- back 20261104140000 (page versions, whose policies use it) first. Postgres
-- cannot drop an enum value, so 'edit_external_projects' stays in
-- workspace_role_permission; with the helper gone it grants nothing in the
-- database. Role grants of it are kept so a re-apply restores editors.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.can_edit_workspace_external_projects(uuid, uuid);

COMMIT;
