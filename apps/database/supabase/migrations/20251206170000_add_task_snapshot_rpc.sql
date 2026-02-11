-- Migration: Add RPC functions for task snapshot reconstruction
-- Purpose: Enable viewing and reverting to historical task states

-- ============================================================================
-- Function 1: Reconstruct task core fields at a specific history point
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

    -- Get current task state
    SELECT
        t.id,
        t.name,
        t.description,
        t.priority,
        t.start_date,
        t.end_date,
        t.estimation_points,
        t.list_id,
        t.completed,
        t.archived,
        t.created_at,
        tl.name as list_name,
        tl.board_id
    INTO v_current_task
    FROM tasks t
    JOIN task_lists tl ON t.list_id = tl.id
    WHERE t.id = p_task_id;

    -- Build initial snapshot from current task
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
        'archived', v_current_task.archived,
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

-- ============================================================================
-- Function 2: Reconstruct relationship state (assignees, labels, projects)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_task_relationships_at_snapshot(
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
    v_target_changed_at TIMESTAMPTZ;
    v_assignees JSONB := '[]'::jsonb;
    v_labels JSONB := '[]'::jsonb;
    v_projects JSONB := '[]'::jsonb;
    v_entry RECORD;
    v_has_access BOOLEAN;
    v_user_id UUID;
    v_label_id UUID;
    v_project_id UUID;
BEGIN
    -- Verify workspace access (same check as above)
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

    -- Get target timestamp
    SELECT changed_at INTO v_target_changed_at
    FROM task_history
    WHERE id = p_history_id
      AND task_id = p_task_id
      AND deleted_at IS NULL;

    IF v_target_changed_at IS NULL THEN
        RAISE EXCEPTION 'History entry not found';
    END IF;

    -- Start with current relationships
    -- Get current assignees
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', u.id,
                'user_id', u.id,
                'display_name', u.display_name,
                'avatar_url', u.avatar_url
            )
        ),
        '[]'::jsonb
    ) INTO v_assignees
    FROM task_assignees ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id = p_task_id;

    -- Get current labels
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', l.id,
                'name', l.name,
                'color', l.color
            )
        ),
        '[]'::jsonb
    ) INTO v_labels
    FROM task_labels tl
    JOIN workspace_task_labels l ON tl.label_id = l.id
    WHERE tl.task_id = p_task_id;

    -- Get current projects
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'name', p.name
            )
        ),
        '[]'::jsonb
    ) INTO v_projects
    FROM task_project_tasks tpt
    JOIN task_projects p ON tpt.project_id = p.id
    WHERE tpt.task_id = p_task_id;

    -- Apply reverse relationship changes from newest to target point
    FOR v_entry IN
        SELECT
            th.change_type,
            th.old_value,
            th.new_value,
            th.metadata
        FROM task_history th
        WHERE th.task_id = p_task_id
          AND th.changed_at > v_target_changed_at
          AND th.change_type IN (
              'assignee_added', 'assignee_removed',
              'label_added', 'label_removed',
              'project_linked', 'project_unlinked'
          )
          AND th.deleted_at IS NULL
        ORDER BY th.changed_at DESC, th.id DESC
    LOOP
        CASE v_entry.change_type
            -- Assignee changes
            WHEN 'assignee_added' THEN
                -- Revert: remove this assignee from snapshot
                v_user_id := COALESCE(
                    (v_entry.new_value->>'user_id')::uuid,
                    (v_entry.new_value->>'id')::uuid,
                    (v_entry.metadata->>'user_id')::uuid
                );
                IF v_user_id IS NOT NULL THEN
                    v_assignees := (
                        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                        FROM jsonb_array_elements(v_assignees) elem
                        WHERE (elem->>'id')::uuid != v_user_id
                          AND (elem->>'user_id')::uuid != v_user_id
                    );
                END IF;

            WHEN 'assignee_removed' THEN
                -- Revert: add this assignee back to snapshot
                IF v_entry.old_value IS NOT NULL AND v_entry.old_value != 'null'::jsonb THEN
                    -- Check if already exists
                    v_user_id := COALESCE(
                        (v_entry.old_value->>'user_id')::uuid,
                        (v_entry.old_value->>'id')::uuid
                    );
                    IF v_user_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(v_assignees) elem
                        WHERE (elem->>'id')::uuid = v_user_id
                           OR (elem->>'user_id')::uuid = v_user_id
                    ) THEN
                        v_assignees := v_assignees || jsonb_build_object(
                            'id', v_user_id,
                            'user_id', v_user_id,
                            'display_name', COALESCE(
                                v_entry.old_value->>'display_name',
                                v_entry.old_value->>'user_name',
                                v_entry.metadata->>'assignee_name',
                                'Unknown'
                            ),
                            'avatar_url', COALESCE(
                                v_entry.old_value->>'avatar_url',
                                v_entry.metadata->>'avatar_url'
                            )
                        );
                    END IF;
                END IF;

            -- Label changes
            WHEN 'label_added' THEN
                -- Revert: remove this label from snapshot
                v_label_id := COALESCE(
                    (v_entry.new_value->>'id')::uuid,
                    (v_entry.metadata->>'label_id')::uuid
                );
                IF v_label_id IS NOT NULL THEN
                    v_labels := (
                        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                        FROM jsonb_array_elements(v_labels) elem
                        WHERE (elem->>'id')::uuid != v_label_id
                    );
                END IF;

            WHEN 'label_removed' THEN
                -- Revert: add this label back to snapshot
                IF v_entry.old_value IS NOT NULL AND v_entry.old_value != 'null'::jsonb THEN
                    v_label_id := (v_entry.old_value->>'id')::uuid;
                    IF v_label_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(v_labels) elem
                        WHERE (elem->>'id')::uuid = v_label_id
                    ) THEN
                        v_labels := v_labels || jsonb_build_object(
                            'id', v_label_id,
                            'name', COALESCE(
                                v_entry.old_value->>'name',
                                v_entry.metadata->>'label_name',
                                'Unknown'
                            ),
                            'color', COALESCE(
                                v_entry.old_value->>'color',
                                v_entry.metadata->>'label_color'
                            )
                        );
                    END IF;
                END IF;

            -- Project changes
            WHEN 'project_linked' THEN
                -- Revert: remove this project from snapshot
                v_project_id := COALESCE(
                    (v_entry.new_value->>'id')::uuid,
                    (v_entry.new_value->>'project_id')::uuid,
                    (v_entry.metadata->>'project_id')::uuid
                );
                IF v_project_id IS NOT NULL THEN
                    v_projects := (
                        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                        FROM jsonb_array_elements(v_projects) elem
                        WHERE (elem->>'id')::uuid != v_project_id
                    );
                END IF;

            WHEN 'project_unlinked' THEN
                -- Revert: add this project back to snapshot
                IF v_entry.old_value IS NOT NULL AND v_entry.old_value != 'null'::jsonb THEN
                    v_project_id := (v_entry.old_value->>'id')::uuid;
                    IF v_project_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(v_projects) elem
                        WHERE (elem->>'id')::uuid = v_project_id
                    ) THEN
                        v_projects := v_projects || jsonb_build_object(
                            'id', v_project_id,
                            'name', COALESCE(
                                v_entry.old_value->>'name',
                                v_entry.old_value->>'project_name',
                                v_entry.metadata->>'project_name',
                                'Unknown'
                            )
                        );
                    END IF;
                END IF;
        END CASE;
    END LOOP;

    RETURN jsonb_build_object(
        'assignees', v_assignees,
        'labels', v_labels,
        'projects', v_projects
    );
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_task_snapshot_at_history(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_relationships_at_snapshot(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON FUNCTION public.get_task_snapshot_at_history IS
'Reconstructs the state of a task at a specific history entry point by reverse-applying
all changes that occurred after that point. Returns core task fields as JSONB.';

COMMENT ON FUNCTION public.get_task_relationships_at_snapshot IS
'Reconstructs the relationship state (assignees, labels, projects) of a task at a
specific history entry point. Works in conjunction with get_task_snapshot_at_history.';
