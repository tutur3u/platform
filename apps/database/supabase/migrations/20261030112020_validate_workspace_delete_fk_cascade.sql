BEGIN;

-- Separate validation phase for 20261030112010_workspace_delete_fk_cascade_guard.
-- This file may be held for a later release independently of the NOT VALID swap.
-- Normal migration discovery applies BOTH files if both are promoted together;
-- separate shipping requires promoting only the swap file in the first release.
set local lock_timeout = '5s';
-- The unpruned realtime log table has unknown production size. VALIDATE takes
-- SHARE UPDATE EXCLUSIVE on the child table, allowing ordinary writes.
set local statement_timeout = '15min';

alter table public.realtime_log_aggregations
  validate constraint realtime_log_aggregations_ws_id_fkey;
alter table public.workspace_documents
  validate constraint workspace_documents_ws_id_fkey;

alter table private.team_members
  validate constraint project_members_project_id_fkey;

notify pgrst, 'reload schema';

COMMIT;
