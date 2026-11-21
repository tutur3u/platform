-- Bind the actor in the shared invoker function so both task RPC entry points
-- enforce the same attribution while keeping caller privileges and RLS.
-- tuturuuu: reviewed(dynamic-sql-review): EXECUTEs a fixed catalog function definition with two literal substitutions, each checked for exactly one match.
DO $migration$
DECLARE
  definition text := pg_catalog.pg_get_functiondef(
    'public.update_task_with_relations_legacy_20260321(uuid,jsonb,uuid[],boolean,uuid[],boolean,uuid[],boolean,uuid)'::regprocedure
  );
  actor_declaration constant text :=
    'v_use_explicit_actor BOOLEAN := p_actor_user_id IS NOT NULL AND auth.uid() IS NULL;';
  actor_assignment constant text :=
    'v_actor_id := COALESCE(p_actor_user_id, auth.uid());';
BEGIN
  IF cardinality(string_to_array(definition, actor_declaration)) IS DISTINCT FROM 2
     OR cardinality(string_to_array(definition, actor_assignment)) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TASK_UPDATE_ACTOR_CONTRACT_DRIFT';
  END IF;

  definition := replace(definition, actor_declaration, $declaration$v_authenticated_actor_id UUID := auth.uid();
  v_use_explicit_actor BOOLEAN := current_user = 'service_role'
    AND v_authenticated_actor_id IS NULL
    AND p_actor_user_id IS NOT NULL;$declaration$);

  definition := replace(definition, actor_assignment, $assignment$v_actor_id := COALESCE(
    v_authenticated_actor_id,
    CASE WHEN v_use_explicit_actor THEN p_actor_user_id END
  );

  IF p_actor_user_id IS NOT NULL AND p_actor_user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'TASK_UPDATE_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;$assignment$);

  EXECUTE definition;
END;
$migration$;
