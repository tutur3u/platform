-- Fix triggers to handle hard delete scenarios
-- When a task is permanently deleted, related table triggers should NOT try to insert history
-- because the task no longer exists (foreign key constraint would fail)

-- ============================================================================
-- Fix notify_task_label_removed to check if task exists first
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_label_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_label_info RECORD;
    v_task_exists BOOLEAN;
BEGIN
    -- Check if this is being called due to a cascade delete (task being hard deleted)
    -- If the task doesn't exist, skip logging as it's being permanently deleted
    SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
    IF NOT v_task_exists THEN
        RETURN OLD;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
        RETURN OLD;
    END IF;

    -- Get label info for better display
    SELECT id, name, color INTO v_label_info
    FROM public.workspace_task_labels
    WHERE id = OLD.label_id;

    -- Log the label removal to task_history (SECURITY DEFINER bypasses RLS)
    PERFORM public.insert_task_history(
        OLD.task_id,
        'label_removed',
        NULL,
        jsonb_build_object(
            'id', OLD.label_id,
            'name', COALESCE(v_label_info.name, 'Unknown label'),
            'color', v_label_info.color
        ),
        NULL,
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'label_name', COALESCE(v_label_info.name, 'Unknown label'),
            'label_color', v_label_info.color
        )
    );

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_label_removed IS 'Logs label removals to task_history. Skips logging when task is being permanently deleted (cascade delete scenario).';

-- ============================================================================
-- Fix notify_task_project_unlinked to check if task exists first
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_project_unlinked()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_project_info RECORD;
    v_task_exists BOOLEAN;
BEGIN
    -- Check if this is being called due to a cascade delete (task being hard deleted)
    -- If the task doesn't exist, skip logging as it's being permanently deleted
    SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
    IF NOT v_task_exists THEN
        RETURN OLD;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
        RETURN OLD;
    END IF;

    -- Get project info for better display
    SELECT id, name INTO v_project_info
    FROM public.task_projects
    WHERE id = OLD.project_id;

    -- Log the project unlink to task_history (SECURITY DEFINER bypasses RLS)
    PERFORM public.insert_task_history(
        OLD.task_id,
        'project_unlinked',
        NULL,
        jsonb_build_object(
            'project_id', OLD.project_id,
            'project_name', COALESCE(v_project_info.name, 'Unknown project')
        ),
        NULL,
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'project_name', COALESCE(v_project_info.name, 'Unknown project')
        )
    );

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_project_unlinked IS 'Logs project unlinks to task_history. Skips logging when task is being permanently deleted (cascade delete scenario).';

-- ============================================================================
-- Fix notify_task_assignee_removed to check if task exists first
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_user_info RECORD;
    v_task_exists BOOLEAN;
BEGIN
    -- Check if this is being called due to a cascade delete (task being hard deleted)
    -- If the task doesn't exist, skip logging as it's being permanently deleted
    SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
    IF NOT v_task_exists THEN
        RETURN OLD;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
        RETURN OLD;
    END IF;

    -- Get user info for better display
    SELECT id, display_name, avatar_url INTO v_user_info
    FROM public.users
    WHERE id = OLD.user_id;

    -- Log the assignee removal to task_history (SECURITY DEFINER bypasses RLS)
    PERFORM public.insert_task_history(
        OLD.task_id,
        'assignee_removed',
        NULL,
        jsonb_build_object(
            'user_id', OLD.user_id,
            'user_name', COALESCE(v_user_info.display_name, 'Unknown user'),
            'avatar_url', v_user_info.avatar_url
        ),
        NULL,
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'assignee_name', COALESCE(v_user_info.display_name, 'Unknown user')
        )
    );

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_assignee_removed IS 'Logs assignee removals to task_history. Skips logging when task is being permanently deleted (cascade delete scenario).';
