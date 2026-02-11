-- Add label name enrichment to single task history RPC
-- This fixes the issue where label_added/label_removed entries show "Unknown" in task dialog

CREATE OR REPLACE FUNCTION public.get_task_history(
    p_ws_id UUID,
    p_task_id UUID,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_change_type TEXT DEFAULT NULL,
    p_field_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    task_id UUID,
    task_name TEXT,
    changed_by UUID,
    changed_at TIMESTAMPTZ,
    change_type TEXT,
    field_name TEXT,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    user_id UUID,
    user_display_name TEXT,
    user_avatar_url TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_access BOOLEAN;
    v_task_ws_id UUID;
BEGIN
    -- Get the workspace ID for the task and verify it matches
    SELECT wb.ws_id INTO v_task_ws_id
    FROM public.tasks t
    JOIN public.task_lists tl ON t.list_id = tl.id
    JOIN public.workspace_boards wb ON tl.board_id = wb.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF v_task_ws_id IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task_ws_id != p_ws_id THEN
        RAISE EXCEPTION 'Task does not belong to this workspace';
    END IF;

    -- Check if user has access to the workspace
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
        UNION ALL
        SELECT 1 FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = p_ws_id AND wrm.user_id = auth.uid()
        UNION ALL
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_ws_id AND w.creator_id = auth.uid()
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied to workspace';
    END IF;

    RETURN QUERY
    WITH task_info AS (
        SELECT t.name AS task_name
        FROM public.tasks t
        WHERE t.id = p_task_id
    ),
    filtered_history AS (
        SELECT
            th.id,
            th.task_id,
            ti.task_name,
            th.changed_by,
            th.changed_at,
            th.change_type,
            th.field_name,
            th.old_value,
            th.new_value,
            th.metadata,
            COUNT(*) OVER() AS total_count
        FROM public.task_history th
        CROSS JOIN task_info ti
        WHERE th.task_id = p_task_id
          AND th.deleted_at IS NULL
          AND (p_change_type IS NULL OR th.change_type = p_change_type)
          AND (p_field_name IS NULL OR th.field_name = p_field_name)
        ORDER BY th.changed_at DESC, th.id DESC
        LIMIT p_limit
        OFFSET p_offset
    ),
    enriched_history AS (
        SELECT
            fh.id,
            fh.task_id,
            fh.task_name,
            fh.changed_by,
            fh.changed_at,
            fh.change_type,
            fh.field_name,
            -- Enrich old_value
            CASE
                -- Project unlinked enrichment
                WHEN fh.change_type = 'project_unlinked'
                     AND fh.old_value IS NOT NULL
                     AND (fh.old_value->>'project_name' IS NULL OR fh.old_value->>'project_name' = '')
                THEN
                    CASE
                        WHEN fh.old_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(fh.old_value, '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value->>'project_id')::uuid)), '"Unknown project"'::jsonb))
                        WHEN fh.old_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_build_object('project_id', fh.old_value #>> '{}', 'project_name',
                                COALESCE((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value #>> '{}')::uuid), 'Unknown project'))
                        ELSE fh.old_value
                    END
                -- Label removed enrichment
                WHEN fh.change_type = 'label_removed'
                     AND fh.old_value IS NOT NULL
                     AND (fh.old_value->>'name' IS NULL OR fh.old_value->>'name' = '')
                THEN
                    CASE
                        WHEN fh.old_value->>'id' IS NOT NULL THEN
                            COALESCE(
                                (SELECT jsonb_build_object('id', wtl.id, 'name', wtl.name, 'color', wtl.color)
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.old_value->>'id')::uuid),
                                fh.old_value)
                        WHEN fh.old_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            COALESCE(
                                (SELECT jsonb_build_object('id', wtl.id, 'name', wtl.name, 'color', wtl.color)
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.old_value #>> '{}')::uuid),
                                jsonb_build_object('id', fh.old_value #>> '{}', 'name', 'Unknown label'))
                        ELSE fh.old_value
                    END
                ELSE fh.old_value
            END AS old_value,
            -- Enrich new_value
            CASE
                -- Project linked enrichment
                WHEN fh.change_type = 'project_linked'
                     AND fh.new_value IS NOT NULL
                     AND (fh.new_value->>'project_name' IS NULL OR fh.new_value->>'project_name' = '')
                THEN
                    CASE
                        WHEN fh.new_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(fh.new_value, '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value->>'project_id')::uuid)), '"Unknown project"'::jsonb))
                        WHEN fh.new_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_build_object('project_id', fh.new_value #>> '{}', 'project_name',
                                COALESCE((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value #>> '{}')::uuid), 'Unknown project'))
                        ELSE fh.new_value
                    END
                -- Label added enrichment
                WHEN fh.change_type = 'label_added'
                     AND fh.new_value IS NOT NULL
                     AND (fh.new_value->>'name' IS NULL OR fh.new_value->>'name' = '')
                THEN
                    CASE
                        WHEN fh.new_value->>'id' IS NOT NULL THEN
                            COALESCE(
                                (SELECT jsonb_build_object('id', wtl.id, 'name', wtl.name, 'color', wtl.color)
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.new_value->>'id')::uuid),
                                fh.new_value)
                        WHEN fh.new_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            COALESCE(
                                (SELECT jsonb_build_object('id', wtl.id, 'name', wtl.name, 'color', wtl.color)
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.new_value #>> '{}')::uuid),
                                jsonb_build_object('id', fh.new_value #>> '{}', 'name', 'Unknown label'))
                        ELSE fh.new_value
                    END
                ELSE fh.new_value
            END AS new_value,
            -- Enrich metadata
            CASE
                -- Project metadata enrichment
                WHEN fh.change_type IN ('project_linked', 'project_unlinked')
                     AND (fh.metadata->>'project_name' IS NULL OR fh.metadata->>'project_name' = '')
                THEN
                    CASE
                        WHEN fh.change_type = 'project_linked' AND fh.new_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value->>'project_id')::uuid)), '"Unknown project"'::jsonb))
                        WHEN fh.change_type = 'project_linked' AND fh.new_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value #>> '{}')::uuid)), '"Unknown project"'::jsonb))
                        WHEN fh.change_type = 'project_unlinked' AND fh.old_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value->>'project_id')::uuid)), '"Unknown project"'::jsonb))
                        WHEN fh.change_type = 'project_unlinked' AND fh.old_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{project_name}',
                                COALESCE(to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value #>> '{}')::uuid)), '"Unknown project"'::jsonb))
                        ELSE fh.metadata
                    END
                -- Label metadata enrichment
                WHEN fh.change_type IN ('label_added', 'label_removed')
                     AND (fh.metadata->>'label_name' IS NULL OR fh.metadata->>'label_name' = '')
                THEN
                    CASE
                        WHEN fh.change_type = 'label_added' AND fh.new_value->>'id' IS NOT NULL THEN
                            COALESCE(
                                (SELECT jsonb_set(jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{label_name}', COALESCE(to_jsonb(wtl.name), '"Unknown label"'::jsonb)), '{label_color}', COALESCE(to_jsonb(wtl.color), 'null'::jsonb))
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.new_value->>'id')::uuid),
                                fh.metadata)
                        WHEN fh.change_type = 'label_removed' AND fh.old_value->>'id' IS NOT NULL THEN
                            COALESCE(
                                (SELECT jsonb_set(jsonb_set(COALESCE(fh.metadata, '{}'::jsonb), '{label_name}', COALESCE(to_jsonb(wtl.name), '"Unknown label"'::jsonb)), '{label_color}', COALESCE(to_jsonb(wtl.color), 'null'::jsonb))
                                 FROM public.workspace_task_labels wtl WHERE wtl.id = (fh.old_value->>'id')::uuid),
                                fh.metadata)
                        ELSE fh.metadata
                    END
                ELSE fh.metadata
            END AS metadata,
            fh.total_count
        FROM filtered_history fh
    )
    SELECT
        eh.id, eh.task_id, eh.task_name, eh.changed_by, eh.changed_at,
        eh.change_type, eh.field_name, eh.old_value, eh.new_value, eh.metadata,
        u.id AS user_id, u.display_name AS user_display_name, u.avatar_url AS user_avatar_url, eh.total_count
    FROM enriched_history eh
    LEFT JOIN public.users u ON eh.changed_by = u.id;
END;
$$;

COMMENT ON FUNCTION public.get_task_history IS 'Retrieves history for a specific task with pagination, filtering, user info, and dynamic lookup for project and label names when missing.';
