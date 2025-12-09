-- Include permanently deleted tasks in task history RPC
-- When a task is permanently deleted, it no longer exists in the tasks table,
-- but history entries should still be visible using metadata stored in task_history

-- Drop existing function first since we're changing the logic significantly
DROP FUNCTION IF EXISTS public.get_workspace_task_history(UUID, INT, INT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_workspace_task_history(
    p_ws_id UUID,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_change_type TEXT DEFAULT NULL,
    p_field_name TEXT DEFAULT NULL,
    p_board_id UUID DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    task_id UUID,
    task_name TEXT,
    task_deleted_at TIMESTAMPTZ,
    task_permanently_deleted BOOLEAN,  -- NEW: indicates if task was permanently deleted
    board_id UUID,
    board_name TEXT,
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
    v_offset INT;
    v_has_access BOOLEAN;
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;

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
    WITH filtered_history AS (
        -- Start from task_history and LEFT JOIN to tasks
        -- This allows us to include history for permanently deleted tasks
        SELECT
            th.id,
            th.task_id,
            -- Task name: from tasks table if exists, otherwise from metadata, otherwise 'Deleted Task'
            COALESCE(
                t.name,
                th.metadata->>'task_name',
                CASE
                    WHEN th.change_type = 'task_created' THEN th.new_value #>> '{}'
                    ELSE 'Deleted Task'
                END
            )::TEXT AS task_name,
            -- Task deleted_at: from tasks table if exists
            t.deleted_at AS task_deleted_at,
            -- Is the task permanently deleted? (not in tasks table)
            (t.id IS NULL) AS task_permanently_deleted,
            -- Board ID: from task's list if exists, otherwise from metadata
            COALESCE(wb.id, (th.metadata->>'board_id')::UUID) AS board_id,
            -- Board name: from workspace_boards if exists, otherwise from metadata
            COALESCE(wb.name, th.metadata->>'board_name', 'Deleted Board')::TEXT AS board_name,
            th.changed_by,
            th.changed_at,
            th.change_type,
            th.field_name,
            th.old_value,
            th.new_value,
            th.metadata,
            COUNT(*) OVER() AS total_count
        FROM public.task_history th
        -- LEFT JOIN to tasks - allows NULL when task is permanently deleted
        LEFT JOIN public.tasks t ON th.task_id = t.id
        -- LEFT JOIN through task_lists to workspace_boards
        LEFT JOIN public.task_lists tl ON t.list_id = tl.id
        LEFT JOIN public.workspace_boards wb ON tl.board_id = wb.id
        WHERE th.deleted_at IS NULL
          -- Filter by workspace: either through the board, or through metadata for deleted tasks
          AND (
              wb.ws_id = p_ws_id
              OR (t.id IS NULL AND (th.metadata->>'ws_id')::UUID = p_ws_id)
          )
          -- Filter by board if specified
          AND (
              p_board_id IS NULL
              OR wb.id = p_board_id
              OR (t.id IS NULL AND (th.metadata->>'board_id')::UUID = p_board_id)
          )
          -- Filter by change type
          AND (p_change_type IS NULL OR th.change_type = p_change_type)
          -- Filter by field name
          AND (p_field_name IS NULL OR th.field_name = p_field_name)
          -- Filter by date range
          AND (p_from IS NULL OR th.changed_at >= p_from)
          AND (p_to IS NULL OR th.changed_at <= p_to)
          -- Search filter: search in task name from tasks table or metadata
          AND (
              p_search IS NULL
              OR t.name ILIKE '%' || p_search || '%'
              OR th.metadata->>'task_name' ILIKE '%' || p_search || '%'
              OR (th.change_type = 'task_created' AND th.new_value #>> '{}' ILIKE '%' || p_search || '%')
          )
        ORDER BY th.changed_at DESC, th.id DESC
        LIMIT p_page_size
        OFFSET v_offset
    ),
    enriched_history AS (
        SELECT
            fh.id,
            fh.task_id,
            fh.task_name,
            fh.task_deleted_at,
            fh.task_permanently_deleted,
            fh.board_id,
            fh.board_name,
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
        eh.id, eh.task_id, eh.task_name, eh.task_deleted_at, eh.task_permanently_deleted,
        eh.board_id, eh.board_name, eh.changed_by, eh.changed_at,
        eh.change_type, eh.field_name, eh.old_value, eh.new_value, eh.metadata,
        u.id AS user_id, u.display_name AS user_display_name, u.avatar_url AS user_avatar_url, eh.total_count
    FROM enriched_history eh
    LEFT JOIN public.users u ON eh.changed_by = u.id;
END;
$$;

COMMENT ON FUNCTION public.get_workspace_task_history IS 'Retrieves task history for a workspace with pagination, filtering, user info, project/label enrichment. Includes both soft-deleted and permanently deleted tasks using metadata fallback.';
