BEGIN;

-- The task trigger runs as part of row writes and has no RPC callers.
REVOKE ALL ON FUNCTION public.touch_task_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

-- The task RPC runs with caller privileges and remains subject to table RLS.
REVOKE ALL ON FUNCTION public.update_task_with_relations(
  uuid, jsonb, uuid[], boolean, uuid[], boolean, uuid[], boolean, uuid
) FROM PUBLIC, anon, authenticated;

-- tuturuuu: reviewed(function-grant): public.update_task_with_relations(uuid,jsonb,uuid[],boolean,uuid[],boolean,uuid[],boolean,uuid) review=20260321053000
GRANT EXECUTE ON FUNCTION public.update_task_with_relations(
  uuid, jsonb, uuid[], boolean, uuid[], boolean, uuid[], boolean, uuid
) TO authenticated, service_role;

COMMIT;
