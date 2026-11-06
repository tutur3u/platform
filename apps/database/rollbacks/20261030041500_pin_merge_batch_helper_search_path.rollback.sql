-- Manual rollback only. This intentionally does NOT restore the previous
-- search paths ('public', 'private', 'pg_temp' / 'public', 'pg_temp'): they
-- were the finding this migration fixes, and an empty path is also unsafe
-- (the egress verifier rejects it). The qualified bodies are semantically
-- identical to the previous ones, so no body revert is needed. This file only
-- re-asserts the pinned path and the service_role-only ACL, which makes it safe
-- to run repeatedly or after a partial failure. Never grants anon,
-- authenticated or PUBLIC EXECUTE.

BEGIN;

-- tuturuuu: reviewed(alter-routine-review): rollback keeps the safe path pg_catalog, pg_temp; never restores public or an empty path
ALTER FUNCTION public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer)
  SET search_path = pg_catalog, pg_temp;
-- tuturuuu: reviewed(alter-routine-review): rollback keeps the safe path pg_catalog, pg_temp; never restores public or an empty path
ALTER FUNCTION public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer)
  SET search_path = pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) TO service_role;

COMMIT;
