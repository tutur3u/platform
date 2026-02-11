-- Enhance task history RPC to dynamically look up project names when missing
-- This fixes the issue where project_linked/project_unlinked entries show UUID instead of name

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
        -- Direct workspace membership
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
        UNION ALL
        -- Role-based access
        SELECT 1 FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = p_ws_id AND wrm.user_id = auth.uid()
        UNION ALL
        -- Workspace creator
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_ws_id AND w.creator_id = auth.uid()
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied to workspace';
    END IF;

    RETURN QUERY
    WITH workspace_tasks AS (
        -- Get all tasks in the workspace with their board info
        SELECT
            t.id AS task_id,
            t.name AS task_name,
            wb.id AS board_id,
            wb.name AS board_name
        FROM public.tasks t
        JOIN public.task_lists tl ON t.list_id = tl.id
        JOIN public.workspace_boards wb ON tl.board_id = wb.id
        WHERE wb.ws_id = p_ws_id
          AND t.deleted_at IS NULL
          AND (p_board_id IS NULL OR wb.id = p_board_id)
          AND (p_search IS NULL OR t.name ILIKE '%' || p_search || '%')
    ),
    filtered_history AS (
        -- Get task history with filters
        SELECT
            th.id,
            th.task_id,
            wt.task_name,
            wt.board_id,
            wt.board_name,
            th.changed_by,
            th.changed_at,
            th.change_type,
            th.field_name,
            th.old_value,
            th.new_value,
            th.metadata,
            COUNT(*) OVER() AS total_count
        FROM public.task_history th
        JOIN workspace_tasks wt ON th.task_id = wt.task_id
        WHERE th.deleted_at IS NULL
          AND (p_change_type IS NULL OR th.change_type = p_change_type)
          AND (p_field_name IS NULL OR th.field_name = p_field_name)
          AND (p_from IS NULL OR th.changed_at >= p_from)
          AND (p_to IS NULL OR th.changed_at <= p_to)
        ORDER BY th.changed_at DESC, th.id DESC
        LIMIT p_page_size
        OFFSET v_offset
    ),
    enriched_history AS (
        -- Enrich project-related entries with project names when missing
        SELECT
            fh.id,
            fh.task_id,
            fh.task_name,
            fh.board_id,
            fh.board_name,
            fh.changed_by,
            fh.changed_at,
            fh.change_type,
            fh.field_name,
            -- Enrich old_value for project_unlinked
            CASE
                WHEN fh.change_type = 'project_unlinked'
                     AND fh.old_value IS NOT NULL
                     AND (fh.old_value->>'project_name' IS NULL OR fh.old_value->>'project_name' = '')
                THEN
                    CASE
                        -- If old_value has project_id, look up the name
                        WHEN fh.old_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(
                                fh.old_value,
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value->>'project_id')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        -- If old_value is just a UUID string (stored incorrectly)
                        WHEN fh.old_value #>> '{}' IS NOT NULL AND fh.old_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_build_object(
                                'project_id', fh.old_value #>> '{}',
                                'project_name', COALESCE(
                                    (SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value #>> '{}')::uuid),
                                    'Unknown project'
                                )
                            )
                        ELSE fh.old_value
                    END
                ELSE fh.old_value
            END AS old_value,
            -- Enrich new_value for project_linked
            CASE
                WHEN fh.change_type = 'project_linked'
                     AND fh.new_value IS NOT NULL
                     AND (fh.new_value->>'project_name' IS NULL OR fh.new_value->>'project_name' = '')
                THEN
                    CASE
                        -- If new_value has project_id, look up the name
                        WHEN fh.new_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(
                                fh.new_value,
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value->>'project_id')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        -- If new_value is just a UUID string (stored incorrectly)
                        WHEN fh.new_value #>> '{}' IS NOT NULL AND fh.new_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_build_object(
                                'project_id', fh.new_value #>> '{}',
                                'project_name', COALESCE(
                                    (SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value #>> '{}')::uuid),
                                    'Unknown project'
                                )
                            )
                        ELSE fh.new_value
                    END
                ELSE fh.new_value
            END AS new_value,
            -- Also enrich metadata with project_name if missing
            CASE
                WHEN fh.change_type IN ('project_linked', 'project_unlinked')
                     AND (fh.metadata->>'project_name' IS NULL OR fh.metadata->>'project_name' = '')
                THEN
                    CASE
                        -- Try to get project_id from new_value (for project_linked) or old_value (for project_unlinked)
                        WHEN fh.change_type = 'project_linked' AND fh.new_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(
                                COALESCE(fh.metadata, '{}'::jsonb),
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value->>'project_id')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        WHEN fh.change_type = 'project_linked' AND fh.new_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_set(
                                COALESCE(fh.metadata, '{}'::jsonb),
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.new_value #>> '{}')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        WHEN fh.change_type = 'project_unlinked' AND fh.old_value->>'project_id' IS NOT NULL THEN
                            jsonb_set(
                                COALESCE(fh.metadata, '{}'::jsonb),
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value->>'project_id')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        WHEN fh.change_type = 'project_unlinked' AND fh.old_value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            jsonb_set(
                                COALESCE(fh.metadata, '{}'::jsonb),
                                '{project_name}',
                                COALESCE(
                                    to_jsonb((SELECT tp.name FROM public.task_projects tp WHERE tp.id = (fh.old_value #>> '{}')::uuid)),
                                    '"Unknown project"'::jsonb
                                )
                            )
                        ELSE fh.metadata
                    END
                ELSE fh.metadata
            END AS metadata,
            fh.total_count
        FROM filtered_history fh
    )
    SELECT
        eh.id,
        eh.task_id,
        eh.task_name,
        eh.board_id,
        eh.board_name,
        eh.changed_by,
        eh.changed_at,
        eh.change_type,
        eh.field_name,
        eh.old_value,
        eh.new_value,
        eh.metadata,
        u.id AS user_id,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        eh.total_count
    FROM enriched_history eh
    LEFT JOIN public.users u ON eh.changed_by = u.id;
END;
$$;

-- Add updated comment
COMMENT ON FUNCTION public.get_workspace_task_history IS 'Efficiently retrieves task history for a workspace with pagination, filtering, user info, and dynamic project name lookup for project_linked/unlinked entries.';
