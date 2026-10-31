-- Not a migration: release-authority approval only.
-- Intentionally a no-op for anon/PUBLIC: never restore their EXECUTE grants.
-- Ordinary authenticated/service_role access is preserved by the migration.
-- The approved provider-ingestion exceptions stay service_role-only.
-- Reapplying this file does not change function or default privileges.
DO $rollback$ BEGIN NULL; END; $rollback$;
