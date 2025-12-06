-- Migration: Fix task snapshot RPC function
-- Fix: Remove non-existent 'archived' column and use 'completed_at' instead of 'completed'

-- ============================================================================
-- Function 1: Reconstruct task core fields at a specific history point (FIXED)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_task_snapshot_at_history(
    p_ws_id UUID,
    p_task_id UUID,
    p_history_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_snapshot JSONB;
    v_target_changed_at TIMESTAMPTZ;
    v_has_access BOOLEAN;
    v_current_task RECORD;
    v_history_entry RECORD;
    v_task_ws_id UUID;
BEGIN
    -- Verify workspace access
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

    -- Verify task belongs to workspace
    SELECT wb.ws_id INTO v_task_ws_id
    FROM tasks t
    JOIN task_lists tl ON t.list_id = tl.id
    JOIN workspace_boards wb ON tl.board_id = wb.id
    WHERE t.id = p_task_id;

    IF v_task_ws_id IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task_ws_id != p_ws_id THEN
        RAISE EXCEPTION 'Task does not belong to this workspace';
    END IF;

    -- Get target history entry timestamp
    SELECT changed_at INTO v_target_changed_at
    FROM task_history
    WHERE id = p_history_id
      AND task_id = p_task_id
      AND deleted_at IS NULL;

    IF v_target_changed_at IS NULL THEN
        RAISE EXCEPTION 'History entry not found';
    END IF;

    -- Get current task state (using completed_at instead of completed, removed archived)
    SELECT
        t.id,
        t.name,
        t.description,
        t.priority,
        t.start_date,
        t.end_date,
        t.estimation_points,
        t.list_id,
        t.completed_at IS NOT NULL as completed,
        t.created_at,
        tl.name as list_name,
        tl.board_id
    INTO v_current_task
    FROM tasks t
    JOIN task_lists tl ON t.list_id = tl.id
    WHERE t.id = p_task_id;

    -- Build initial snapshot from current task (removed archived field)
    v_snapshot := jsonb_build_object(
        'id', v_current_task.id,
        'name', v_current_task.name,
        'description', v_current_task.description,
        'priority', v_current_task.priority,
        'start_date', v_current_task.start_date,
        'end_date', v_current_task.end_date,
        'estimation_points', v_current_task.estimation_points,
        'list_id', v_current_task.list_id,
        'list_name', v_current_task.list_name,
        'completed', v_current_task.completed,
        'created_at', v_current_task.created_at,
        'board_id', v_current_task.board_id
    );

    -- Apply reverse changes from newest to target point
    -- This reconstructs the state at the target history entry
    FOR v_history_entry IN
        SELECT
            th.field_name,
            th.old_value,
            th.new_value,
            th.change_type,
            th.metadata
        FROM task_history th
        WHERE th.task_id = p_task_id
          AND th.changed_at > v_target_changed_at
          AND th.change_type = 'field_updated'
          AND th.field_name IS NOT NULL
          AND th.deleted_at IS NULL
        ORDER BY th.changed_at DESC, th.id DESC
    LOOP
        -- Revert each field change by applying old_value
        -- Handle different field types appropriately
        CASE v_history_entry.field_name
            WHEN 'name' THEN
                v_snapshot := jsonb_set(v_snapshot, '{name}',
                    COALESCE(to_jsonb(v_history_entry.old_value #>> '{}'), 'null'::jsonb));
            WHEN 'description' THEN
                v_snapshot := jsonb_set(v_snapshot, '{description}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
            WHEN 'priority' THEN
                v_snapshot := jsonb_set(v_snapshot, '{priority}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
            WHEN 'start_date' THEN
                v_snapshot := jsonb_set(v_snapshot, '{start_date}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
            WHEN 'end_date' THEN
                v_snapshot := jsonb_set(v_snapshot, '{end_date}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
            WHEN 'estimation_points' THEN
                v_snapshot := jsonb_set(v_snapshot, '{estimation_points}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
            WHEN 'list_id' THEN
                v_snapshot := jsonb_set(v_snapshot, '{list_id}',
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
                -- Also update list_name from metadata if available
                IF v_history_entry.metadata ? 'old_list_name' THEN
                    v_snapshot := jsonb_set(v_snapshot, '{list_name}',
                        to_jsonb(v_history_entry.metadata->>'old_list_name'));
                END IF;
            WHEN 'completed' THEN
                v_snapshot := jsonb_set(v_snapshot, '{completed}',
                    COALESCE(v_history_entry.old_value, 'false'::jsonb));
            ELSE
                -- For any other fields, apply the old value directly
                v_snapshot := jsonb_set(v_snapshot, ARRAY[v_history_entry.field_name],
                    COALESCE(v_history_entry.old_value, 'null'::jsonb));
        END CASE;
    END LOOP;

    RETURN v_snapshot;
END;
$$;

-- Re-grant permissions (in case they were lost)
GRANT EXECUTE ON FUNCTION public.get_task_snapshot_at_history(UUID, UUID, UUID) TO authenticated;
