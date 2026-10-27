-- Step 1: restore pre-D FK definitions as NOT VALID, then COMMIT.
-- Reintroduces the known document 23503 and log NOT NULL 23502 delete failures.
-- Step 2: run 20261027060400_workspace_delete_fk_cascade.rollback-validate.sql
-- in a SEPARATE transaction to restore the original validated catalog.
-- Do not wrap both files in one transaction: swap/index locks must be released.
-- Manual rollback only with release-authority approval; never an automatic down.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.realtime_log_aggregations
  drop constraint realtime_log_aggregations_ws_id_fkey,
  add constraint realtime_log_aggregations_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id)
    on update cascade on delete set null not valid;
alter table public.workspace_documents
  drop constraint workspace_documents_ws_id_fkey,
  add constraint workspace_documents_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id) not valid;

alter table private.team_members
  drop constraint project_members_project_id_fkey,
  add constraint project_members_project_id_fkey
    foreign key (team_id) references public.workspace_teams(id) not valid;

-- D introduces this index on the main baseline. If it predated D on a target,
-- preserve that pre-existing index instead of executing this DROP during rollback.
drop index if exists public.workspace_documents_ws_id_idx;

notify pgrst, 'reload schema';
commit;
