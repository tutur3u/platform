-- Rollback: 20261029005000_guard_managed_cron_enabled_secret.sql
--
-- Removes the database guard on the reserved MANAGED_CRON_ENABLED workspace
-- secret. After rollback, only the app-level verified-staff check protects it,
-- and root-workspace members with manage_workspace_secrets can again write it
-- directly over PostgREST.

begin;

drop trigger if exists workspace_secrets_guard_reserved_names
on public.workspace_secrets;

drop function if exists public.guard_workspace_reserved_secrets();

commit;
