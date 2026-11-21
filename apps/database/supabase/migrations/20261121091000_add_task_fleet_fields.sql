-- Fleet metadata inherits the task row's existing RLS policies. Nullable
-- metadata lets legacy cards fall back to their description until populated.
ALTER TABLE public.tasks
  ADD COLUMN virtual_assignees jsonb,
  ADD COLUMN needs_user boolean,
  ADD COLUMN needs_user_reason text,
  ADD COLUMN task_resources jsonb,
  ADD COLUMN updated_at timestamptz,
  ADD CONSTRAINT tasks_virtual_assignees_shape CHECK (
    CASE WHEN jsonb_typeof(virtual_assignees) = 'array' THEN
      jsonb_array_length(virtual_assignees) <= 50
      AND octet_length(virtual_assignees::text) <= 32000
      AND jsonb_path_query_array(
        virtual_assignees,
        '$[*] ? (@.type() == "object"
          && @.kind.type() == "string" && @.kind == "agent"
          && @.key.type() == "string"
          && @.key like_regex "^.{1,128}$" flag "s"
          && @.position.type() == "number"
          && @.position >= 0 && @.position <= 49
          && @.position == @.position.floor()
          && !exists(@.keyvalue() ? (@.key != "kind" && @.key != "key" && @.key != "position")))'
      ) = virtual_assignees
    ELSE virtual_assignees IS NULL END
  ),
  ADD CONSTRAINT tasks_needs_user_reason_length CHECK (
    char_length(needs_user_reason) BETWEEN 1 AND 1000
  ),
  ADD CONSTRAINT tasks_resources_shape CHECK (
    CASE WHEN jsonb_typeof(task_resources) = 'array' THEN
      jsonb_array_length(task_resources) <= 50
      AND octet_length(task_resources::text) <= 512000
      AND jsonb_path_query_array(
        task_resources,
        '$[*] ? (@.type() == "object"
          && @.kind.type() == "string" && @.kind == "link"
          && @.url.type() == "string"
          && @.url like_regex "^https?://.+$" flag "is"
          && (!exists(@.title) || (@.title.type() == "string" && @.title like_regex "^.{1,128}.{0,128}$" flag "s"))
          && !exists(@.keyvalue() ? (@.key != "kind" && @.key != "url" && @.key != "title")))'
      ) = task_resources
    ELSE task_resources IS NULL END
  );

CREATE FUNCTION public.touch_task_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_task_updated_at
BEFORE INSERT OR UPDATE OF name, description, description_yjs_state, priority,
  start_date, end_date, completed, completed_at, closed_at, list_id,
  estimation_points, sort_key, deleted_at, virtual_assignees, needs_user,
  needs_user_reason, task_resources, updated_at
ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_task_updated_at();

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
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_updated_task public.tasks%rowtype;
  v_description_yjs_state SMALLINT[];
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

  IF p_task_updates ? 'description_yjs_state'
    AND jsonb_typeof(p_task_updates->'description_yjs_state') <> 'null' THEN
    SELECT COALESCE(array_agg(value::smallint), ARRAY[]::smallint[])
    INTO v_description_yjs_state
    FROM jsonb_array_elements_text(p_task_updates->'description_yjs_state') AS value;
  END IF;

  IF p_task_updates ?| ARRAY['virtual_assignees', 'needs_user', 'needs_user_reason', 'task_resources']
    OR (p_task_updates ? 'description_yjs_state'
      AND v_updated_task.description_yjs_state IS DISTINCT FROM v_description_yjs_state) THEN
    UPDATE public.tasks
    SET virtual_assignees = CASE WHEN p_task_updates ? 'virtual_assignees'
          THEN NULLIF(p_task_updates->'virtual_assignees', 'null'::jsonb)
          ELSE virtual_assignees END,
        needs_user = CASE WHEN p_task_updates ? 'needs_user'
          THEN (p_task_updates->>'needs_user')::boolean ELSE needs_user END,
        needs_user_reason = CASE WHEN p_task_updates ? 'needs_user_reason'
          THEN p_task_updates->>'needs_user_reason' ELSE needs_user_reason END,
        task_resources = CASE WHEN p_task_updates ? 'task_resources'
          THEN NULLIF(p_task_updates->'task_resources', 'null'::jsonb)
          ELSE task_resources END,
        description_yjs_state = CASE WHEN p_task_updates ? 'description_yjs_state'
          THEN v_description_yjs_state ELSE description_yjs_state END
    WHERE id = p_task_id
    RETURNING * INTO v_updated_task;
  END IF;

  RETURN NEXT v_updated_task;
  RETURN;
END;
$$;
