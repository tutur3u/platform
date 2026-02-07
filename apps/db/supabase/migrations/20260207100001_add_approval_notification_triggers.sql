-- Extend the notifications_type_check constraint with report/post approval types

-- Drop existing constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Re-create with new types
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'task_assigned',
        'task_updated',
        'task_mention',
        'task_label_added',
        'task_label_removed',
        'task_title_changed',
        'task_description_changed',
        'task_priority_changed',
        'task_due_date_changed',
        'task_start_date_changed',
        'task_estimation_changed',
        'task_assignee_added',
        'task_assignee_removed',
        'task_project_linked',
        'task_project_unlinked',
        'deadline_reminder',
        'workspace_invite',
        'system_announcement',
        -- New approval notification types
        'report_approved',
        'report_rejected',
        'post_approved',
        'post_rejected'
    ));

-- ===========================================================================
-- REPORT APPROVAL NOTIFICATION TRIGGER
-- Fires AFTER UPDATE when report_approval_status changes to APPROVED/REJECTED
-- Notifies the report's creator (the teacher/manager who wrote the report)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_report_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_platform_user_id uuid;
    v_reviewer_name text;
    v_report_title text;
    v_notification_type text;
    v_notification_title text;
    v_notification_description text;
    v_data jsonb;
BEGIN
    -- Only fire when approval status actually changed
    IF OLD.report_approval_status IS NOT DISTINCT FROM NEW.report_approval_status THEN
        RETURN NEW;
    END IF;

    -- Only handle APPROVED or REJECTED transitions
    IF NEW.report_approval_status NOT IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    -- Skip if no creator_id (can't notify anyone)
    IF NEW.creator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the workspace ID for this report
    v_ws_id := public.get_report_workspace_id(NEW.id);
    IF v_ws_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Find the platform user linked to the creator (workspace user)
    SELECT platform_user_id INTO v_platform_user_id
    FROM public.workspace_user_linked_users
    WHERE virtual_user_id = NEW.creator_id
      AND ws_id = v_ws_id
    LIMIT 1;

    -- Skip if creator has no linked platform user
    IF v_platform_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip if the reviewer IS the creator (no self-notifications)
    IF NEW.report_approval_status = 'APPROVED' AND NEW.approved_by = NEW.creator_id THEN
        RETURN NEW;
    END IF;
    IF NEW.report_approval_status = 'REJECTED' AND NEW.rejected_by = NEW.creator_id THEN
        RETURN NEW;
    END IF;

    -- Get reviewer name
    IF NEW.report_approval_status = 'APPROVED' THEN
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.approved_by;
    ELSE
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.rejected_by;
    END IF;

    v_report_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Report');

    -- Build notification based on type
    IF NEW.report_approval_status = 'APPROVED' THEN
        v_notification_type := 'report_approved';
        v_notification_title := 'Report approved';
        v_notification_description := COALESCE(v_reviewer_name, 'Someone') || ' approved "' || v_report_title || '"';
        v_data := jsonb_build_object(
            'report_id', NEW.id,
            'report_title', v_report_title,
            'group_id', NEW.group_id,
            'reviewer_name', v_reviewer_name
        );
    ELSE
        v_notification_type := 'report_rejected';
        v_notification_title := 'Report rejected';
        v_notification_description := COALESCE(v_reviewer_name, 'Someone') || ' rejected "' || v_report_title || '"';
        v_data := jsonb_build_object(
            'report_id', NEW.id,
            'report_title', v_report_title,
            'group_id', NEW.group_id,
            'reviewer_name', v_reviewer_name,
            'rejection_reason', NEW.rejection_reason
        );
    END IF;

    -- Create the notification
    PERFORM public.create_notification(
        p_ws_id := v_ws_id,
        p_user_id := v_platform_user_id,
        p_type := v_notification_type,
        p_title := v_notification_title,
        p_description := v_notification_description,
        p_data := v_data,
        p_entity_type := 'report',
        p_entity_id := NEW.id,
        p_created_by := CASE
            WHEN NEW.report_approval_status = 'APPROVED' THEN NEW.approved_by
            ELSE NEW.rejected_by
        END
    );

    RETURN NEW;
END;
$$;

-- Create the AFTER UPDATE trigger (AFTER, not BEFORE — the BEFORE trigger sets fields first)
DROP TRIGGER IF EXISTS trg_notify_report_approval ON public.external_user_monthly_reports;
CREATE TRIGGER trg_notify_report_approval
    AFTER UPDATE ON public.external_user_monthly_reports
    FOR EACH ROW
    WHEN (OLD.report_approval_status IS DISTINCT FROM NEW.report_approval_status)
    EXECUTE FUNCTION public.notify_report_approval_change();

-- ===========================================================================
-- POST APPROVAL NOTIFICATION TRIGGER
-- Fires AFTER UPDATE when post_approval_status changes to APPROVED/REJECTED
-- Notifies teachers/managers in the post's group
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_post_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_platform_user_id uuid;
    v_reviewer_name text;
    v_post_title text;
    v_notification_type text;
    v_notification_title text;
    v_notification_description text;
    v_data jsonb;
    v_teacher record;
BEGIN
    -- Only fire when approval status actually changed
    IF OLD.post_approval_status IS NOT DISTINCT FROM NEW.post_approval_status THEN
        RETURN NEW;
    END IF;

    -- Only handle APPROVED or REJECTED transitions
    IF NEW.post_approval_status NOT IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    -- Get workspace ID
    v_ws_id := public.get_post_workspace_id(NEW.id);
    IF v_ws_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get reviewer name
    IF NEW.post_approval_status = 'APPROVED' THEN
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.approved_by;
    ELSE
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.rejected_by;
    END IF;

    v_post_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Post');

    -- Build notification
    IF NEW.post_approval_status = 'APPROVED' THEN
        v_notification_type := 'post_approved';
        v_notification_title := 'Post approved';
        v_notification_description := COALESCE(v_reviewer_name, 'Someone') || ' approved "' || v_post_title || '"';
        v_data := jsonb_build_object(
            'post_id', NEW.id,
            'post_title', v_post_title,
            'group_id', NEW.group_id,
            'reviewer_name', v_reviewer_name
        );
    ELSE
        v_notification_type := 'post_rejected';
        v_notification_title := 'Post rejected';
        v_notification_description := COALESCE(v_reviewer_name, 'Someone') || ' rejected "' || v_post_title || '"';
        v_data := jsonb_build_object(
            'post_id', NEW.id,
            'post_title', v_post_title,
            'group_id', NEW.group_id,
            'reviewer_name', v_reviewer_name,
            'rejection_reason', NEW.rejection_reason
        );
    END IF;

    -- Notify all TEACHERs in the group (they are the ones who create/manage posts)
    -- Skip the reviewer themselves
    FOR v_teacher IN
        SELECT wulu.platform_user_id
        FROM public.workspace_user_groups_users wugu
        JOIN public.workspace_user_linked_users wulu
            ON wulu.virtual_user_id = wugu.user_id
            AND wulu.ws_id = v_ws_id
        WHERE wugu.group_id = NEW.group_id
          AND wugu.role = 'TEACHER'
          AND wulu.platform_user_id IS NOT NULL
          -- Exclude the reviewer
          AND wugu.user_id != COALESCE(
              CASE WHEN NEW.post_approval_status = 'APPROVED' THEN NEW.approved_by ELSE NEW.rejected_by END,
              '00000000-0000-0000-0000-000000000000'::uuid
          )
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_ws_id,
            p_user_id := v_teacher.platform_user_id,
            p_type := v_notification_type,
            p_title := v_notification_title,
            p_description := v_notification_description,
            p_data := v_data,
            p_entity_type := 'post',
            p_entity_id := NEW.id,
            p_created_by := CASE
                WHEN NEW.post_approval_status = 'APPROVED' THEN NEW.approved_by
                ELSE NEW.rejected_by
            END
        );
    END LOOP;

    RETURN NEW;
END;
$$;

-- Create the AFTER UPDATE trigger
DROP TRIGGER IF EXISTS trg_notify_post_approval ON public.user_group_posts;
CREATE TRIGGER trg_notify_post_approval
    AFTER UPDATE ON public.user_group_posts
    FOR EACH ROW
    WHEN (OLD.post_approval_status IS DISTINCT FROM NEW.post_approval_status)
    EXECUTE FUNCTION public.notify_post_approval_change();
