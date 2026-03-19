-- Approval notification triggers store reviewer IDs on reports/posts as
-- workspace_users IDs, but notifications.created_by references public.users.
-- Resolve the reviewer back to the linked platform user before creating
-- notifications so approval updates no longer violate notifications_created_by_fkey.

CREATE OR REPLACE FUNCTION public.notify_report_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_platform_user_id uuid;
    v_reviewer_platform_user_id uuid;
    v_reviewer_name text;
    v_report_title text;
    v_notification_type text;
    v_notification_title text;
    v_notification_description text;
    v_data jsonb;
BEGIN
    IF OLD.report_approval_status IS NOT DISTINCT FROM NEW.report_approval_status THEN
        RETURN NEW;
    END IF;

    IF NEW.report_approval_status NOT IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    SELECT ws_id INTO v_ws_id
    FROM public.workspace_users
    WHERE id = NEW.creator_id;

    IF v_ws_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT platform_user_id INTO v_platform_user_id
    FROM public.workspace_user_linked_users
    WHERE virtual_user_id = NEW.creator_id
      AND ws_id = v_ws_id
    LIMIT 1;

    IF v_platform_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.report_approval_status = 'APPROVED' AND NEW.approved_by = NEW.creator_id THEN
        RETURN NEW;
    END IF;

    IF NEW.report_approval_status = 'REJECTED' AND NEW.rejected_by = NEW.creator_id THEN
        RETURN NEW;
    END IF;

    IF NEW.report_approval_status = 'APPROVED' THEN
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.approved_by;

        SELECT platform_user_id INTO v_reviewer_platform_user_id
        FROM public.workspace_user_linked_users
        WHERE virtual_user_id = NEW.approved_by
          AND ws_id = v_ws_id
        LIMIT 1;
    ELSE
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.rejected_by;

        SELECT platform_user_id INTO v_reviewer_platform_user_id
        FROM public.workspace_user_linked_users
        WHERE virtual_user_id = NEW.rejected_by
          AND ws_id = v_ws_id
        LIMIT 1;
    END IF;

    v_report_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Report');

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

    PERFORM public.create_notification(
        p_ws_id := v_ws_id,
        p_user_id := v_platform_user_id,
        p_type := v_notification_type,
        p_title := v_notification_title,
        p_description := v_notification_description,
        p_data := v_data,
        p_entity_type := 'report',
        p_entity_id := NEW.id,
        p_created_by := v_reviewer_platform_user_id
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_reviewer_name text;
    v_reviewer_platform_user_id uuid;
    v_post_title text;
    v_notification_type text;
    v_notification_title text;
    v_notification_description text;
    v_data jsonb;
    v_teacher record;
BEGIN
    IF OLD.post_approval_status IS NOT DISTINCT FROM NEW.post_approval_status THEN
        RETURN NEW;
    END IF;

    IF NEW.post_approval_status NOT IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    v_ws_id := public.get_post_workspace_id(NEW.id);
    IF v_ws_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.post_approval_status = 'APPROVED' THEN
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.approved_by;

        SELECT platform_user_id INTO v_reviewer_platform_user_id
        FROM public.workspace_user_linked_users
        WHERE virtual_user_id = NEW.approved_by
          AND ws_id = v_ws_id
        LIMIT 1;
    ELSE
        SELECT full_name INTO v_reviewer_name
        FROM public.workspace_users
        WHERE id = NEW.rejected_by;

        SELECT platform_user_id INTO v_reviewer_platform_user_id
        FROM public.workspace_user_linked_users
        WHERE virtual_user_id = NEW.rejected_by
          AND ws_id = v_ws_id
        LIMIT 1;
    END IF;

    v_post_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Post');

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

    FOR v_teacher IN
        SELECT wulu.platform_user_id
        FROM public.workspace_user_groups_users wugu
        JOIN public.workspace_user_linked_users wulu
            ON wulu.virtual_user_id = wugu.user_id
            AND wulu.ws_id = v_ws_id
        WHERE wugu.group_id = NEW.group_id
          AND wugu.role = 'TEACHER'
          AND wulu.platform_user_id IS NOT NULL
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
            p_created_by := v_reviewer_platform_user_id
        );
    END LOOP;

    RETURN NEW;
END;
$$;
