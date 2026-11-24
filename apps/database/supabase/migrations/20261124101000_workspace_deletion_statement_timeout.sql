begin;
set local lock_timeout = '5s';

-- Workspace deletion removes every workspace-owned row in one cascading
-- statement. PostgREST applies a called function's statement_timeout to the
-- request transaction, replacing the API role's 8-second limit. The value leaves
-- room for the billing step before it within the API gateway's upstream
-- timeout, so a slow deletion rolls back and returns a statement timeout
-- instead of an unknown outcome.
-- tuturuuu: reviewed(alter-routine-review): IRIS-ALTER-ROUTINE-20261124-101000 statement_timeout only; security and search_path unchanged
alter function public.delete_owned_workspace(uuid, uuid, text)
  set statement_timeout = '60s';
-- tuturuuu: reviewed(alter-routine-review): IRIS-ALTER-ROUTINE-20261124-101000 statement_timeout only; security and search_path unchanged
alter function private.delete_owned_workspace_with_attendance_intent(uuid, uuid, text, jsonb)
  set statement_timeout = '60s';
-- tuturuuu: reviewed(alter-routine-review): IRIS-ALTER-ROUTINE-20261124-101000 statement_timeout only; security and search_path unchanged
alter function private.delete_workspace_with_attendance_intent(uuid, jsonb)
  set statement_timeout = '60s';

notify pgrst, 'reload schema';
commit;
