-- Ensure task update RPCs persist description_yjs_state payloads.

ALTER FUNCTION public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID)
RENAME TO update_task_with_relations_legacy_20260321;

CREATE OR REPLACE FUNCTION public.update_task_with_relations(
  p_task_id UUID,
  p_task_updates JSONB,
  p_assignee_ids UUID[] DEFAULT NULL,
  p_replace_assignees BOOLEAN DEFAULT FALSE,
  p_label_ids UUID[] DEFAULT NULL,
  p_replace_labels BOOLEAN DEFAULT FALSE,
  p_project_ids UUID[] DEFAULT NULL,
  p_replace_projects BOOLEAN DEFAULT FALSE,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated_task public.tasks%rowtype;
  v_description_yjs_state SMALLINT[] := NULL;
BEGIN
  SELECT *
  INTO v_updated_task
  FROM public.update_task_with_relations_legacy_20260321(
    p_task_id := p_task_id,
    p_task_updates := p_task_updates,
    p_assignee_ids := p_assignee_ids,
    p_replace_assignees := p_replace_assignees,
    p_label_ids := p_label_ids,
    p_replace_labels := p_replace_labels,
    p_project_ids := p_project_ids,
    p_replace_projects := p_replace_projects,
    p_actor_user_id := p_actor_user_id
  )
  LIMIT 1;

  IF v_updated_task IS NULL THEN
    RETURN;
  END IF;

  IF p_task_updates ? 'description_yjs_state' THEN
    IF jsonb_typeof(p_task_updates->'description_yjs_state') = 'null' THEN
      UPDATE public.tasks
      SET description_yjs_state = NULL
      WHERE id = p_task_id
        AND description_yjs_state IS NOT NULL
      RETURNING * INTO v_updated_task;
    ELSE
      SELECT COALESCE(array_agg(value::SMALLINT), ARRAY[]::SMALLINT[])
      INTO v_description_yjs_state
      FROM jsonb_array_elements_text(p_task_updates->'description_yjs_state') AS value;

      UPDATE public.tasks
      SET description_yjs_state = v_description_yjs_state
      WHERE id = p_task_id
        AND description_yjs_state IS DISTINCT FROM v_description_yjs_state
      RETURNING * INTO v_updated_task;
    END IF;
  END IF;

  RETURN NEXT v_updated_task;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_with_relations_legacy_20260321(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID) TO authenticated;

COMMENT ON FUNCTION public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID) IS
'Updates a task, optionally replaces task relations, propagates explicit actor context, and persists description_yjs_state payload parity.';

CREATE OR REPLACE FUNCTION public.update_task_fields_with_actor(
  p_task_id UUID,
  p_task_updates JSONB,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.update_task_with_relations(
    p_task_id := p_task_id,
    p_task_updates := p_task_updates,
    p_assignee_ids := NULL,
    p_replace_assignees := FALSE,
    p_label_ids := NULL,
    p_replace_labels := FALSE,
    p_project_ids := NULL,
    p_replace_projects := FALSE,
    p_actor_user_id := p_actor_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_fields_with_actor(UUID, JSONB, UUID) TO authenticated;
