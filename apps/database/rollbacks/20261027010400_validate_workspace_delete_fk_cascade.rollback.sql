-- Undo only validation: restore the post-D CASCADE constraints as NOT VALID.
-- PostgreSQL cannot unvalidate an FK in place, so replace it without a scan.
-- Manual rollback only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.realtime_log_aggregations
  drop constraint realtime_log_aggregations_ws_id_fkey,
  add constraint realtime_log_aggregations_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id)
    on update cascade on delete cascade not valid;
alter table public.workspace_documents
  drop constraint workspace_documents_ws_id_fkey,
  add constraint workspace_documents_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id)
    on delete cascade not valid;

notify pgrst, 'reload schema';
commit;
