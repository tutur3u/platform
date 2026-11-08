-- Rollback: FULL rollback of 20261028152419_protect_workspace_ownership_changes.sql,
-- including the 20261029012000 hardening (audit trigger, guard body, RPC).
-- Not a migration: release-authority approval only. Use only under incident
-- command: it reopens creator_id takeover by any manage_workspace_settings
-- holder. Prefer 20261029012000's rollback if only the hardening is a problem.
-- Audit history is renamed, not dropped; run
--   drop table if exists public.workspace_ownership_transfers_rolled_back_20261028;
-- by hand only after the audit data is archived.
-- The table-level UPDATE grant on public.workspaces stays: authenticated held
-- it through Supabase default privileges before the migration. Verify with
--   select has_table_privilege('authenticated', 'public.workspaces', 'UPDATE');
-- Also remove the transfer_workspace_ownership row from
-- tests/20261027151200_anon-definer-execute.sql and delete
-- tests/workspace-ownership-protection.sql when this is applied.
begin;
drop trigger if exists workspaces_audit_creator_change on public.workspaces;
drop function if exists private.audit_workspace_creator_change();
drop trigger if exists workspaces_guard_protected_columns on public.workspaces;
drop function if exists public.guard_workspace_protected_columns();
drop function if exists public.transfer_workspace_ownership(uuid, uuid);

alter table if exists public.workspace_ownership_transfers
  rename to workspace_ownership_transfers_rolled_back_20261028;
alter index if exists public.workspace_ownership_transfers_ws_id_idx
  rename to workspace_ownership_transfers_rb_20261028_ws_id_idx;
commit;
