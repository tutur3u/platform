-- Restore the exact pre-D definitions, including validated state.
-- Reintroduces the known document 23503 and log NOT NULL 23502 delete failures.
-- Validation scans are necessary to restore the original catalog byte-for-byte.
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

alter table public.realtime_log_aggregations
  validate constraint realtime_log_aggregations_ws_id_fkey;
alter table public.workspace_documents
  validate constraint workspace_documents_ws_id_fkey;

notify pgrst, 'reload schema';
commit;
