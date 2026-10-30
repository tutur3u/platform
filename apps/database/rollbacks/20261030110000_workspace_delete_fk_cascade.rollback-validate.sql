-- Step 2 of the D rollback: validate original definitions after the swap COMMIT.
-- Run separately from 20261030110000_workspace_delete_fk_cascade.rollback.sql.
-- The swap's ACCESS EXCLUSIVE locks must not survive into these scans.
-- Manual rollback only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

alter table public.realtime_log_aggregations
  validate constraint realtime_log_aggregations_ws_id_fkey;
alter table public.workspace_documents
  validate constraint workspace_documents_ws_id_fkey;
alter table private.team_members
  validate constraint project_members_project_id_fkey;

notify pgrst, 'reload schema';
commit;
