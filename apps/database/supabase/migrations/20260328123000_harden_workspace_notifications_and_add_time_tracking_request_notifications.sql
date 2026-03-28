-- Harden workspace-scoped notification creation so recipients must still be
-- active workspace members, and add time tracking request notification types.

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

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
        'task_moved',
        'task_completed',
        'task_reopened',
        'task_deleted',
        'task_restored',
        'deadline_reminder',
        'workspace_invite',
        'system_announcement',
        'account_update',
        'security_alert',
        'report_approved',
        'report_rejected',
        'post_approved',
        'post_rejected',
        'time_tracking_request_submitted',
        'time_tracking_request_resubmitted',
        'time_tracking_request_approved',
        'time_tracking_request_rejected',
        'time_tracking_request_needs_info'
    ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
    'Validates notification types for task activity, workspace/system notices, approvals, and time tracking request workflows.';

INSERT INTO public.notification_email_config (
    notification_type,
    delivery_mode,
    email_template,
    batch_window_minutes,
    enabled
)
VALUES
    ('time_tracking_request_submitted', 'batched', NULL, 10, true),
    ('time_tracking_request_resubmitted', 'batched', NULL, 10, true),
    ('time_tracking_request_approved', 'batched', NULL, 10, true),
    ('time_tracking_request_rejected', 'batched', NULL, 10, true),
    ('time_tracking_request_needs_info', 'batched', NULL, 10, true)
ON CONFLICT (notification_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_notification(
    p_ws_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_scope public.notification_scope DEFAULT 'workspace',
    p_priority public.notification_priority DEFAULT 'medium'
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
    v_should_send_web BOOLEAN := FALSE;
    v_should_send_email BOOLEAN := FALSE;
    v_should_send_push BOOLEAN := FALSE;
    v_should_create_notification BOOLEAN := FALSE;
    v_email_batch_id UUID;
    v_push_batch_id UUID;
    v_target_user_id UUID;
    v_target_email TEXT;
    v_email_config RECORD;
    v_notification_key TEXT;
    v_email_delivery_mode public.notification_delivery_mode;
    v_push_delivery_mode public.notification_delivery_mode;
    v_email_batch_window INTEGER;
    v_push_batch_window INTEGER;
    v_final_priority public.notification_priority;
    v_is_workspace_member BOOLEAN := TRUE;
BEGIN
    SET LOCAL search_path = pg_temp, public;

    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided';
    END IF;

    IF p_user_id IS NOT NULL THEN
        v_target_user_id := p_user_id;
    ELSE
        v_target_user_id := NULL;
    END IF;

    IF v_target_user_id IS NOT NULL
       AND p_ws_id IS NOT NULL
       AND p_scope = 'workspace'::public.notification_scope THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.workspace_members
            WHERE ws_id = p_ws_id
              AND user_id = v_target_user_id
        )
        INTO v_is_workspace_member;

        IF NOT v_is_workspace_member THEN
            RETURN NULL;
        END IF;
    END IF;

    v_notification_key := COALESCE(p_type, p_code);

    SELECT * INTO v_email_config
    FROM public.get_notification_email_config(v_notification_key);

    v_email_delivery_mode := COALESCE(v_email_config.delivery_mode, 'batched');
    v_email_batch_window := COALESCE(v_email_config.batch_window_minutes, 10);
    v_final_priority := COALESCE(v_email_config.priority_override, p_priority);

    v_push_delivery_mode := CASE
        WHEN v_notification_key IN (
            'workspace_invite',
            'task_mention',
            'security_alert',
            'account_update'
        ) THEN 'immediate'::public.notification_delivery_mode
        ELSE 'batched'::public.notification_delivery_mode
    END;

    v_push_batch_window := CASE
        WHEN v_notification_key = 'task_mention' THEN 5
        ELSE v_email_batch_window
    END;

    IF v_target_user_id IS NOT NULL THEN
        IF p_email IS NULL THEN
            SELECT email INTO v_target_email
            FROM public.user_private_details
            WHERE user_id = v_target_user_id;
        ELSE
            v_target_email := p_email;
        END IF;
    ELSE
        v_target_email := p_email;
    END IF;

    IF v_target_user_id IS NOT NULL THEN
        v_should_send_web := public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'web',
            p_scope,
            p_ws_id
        );

        v_should_send_email := v_target_email IS NOT NULL AND public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'email',
            p_scope,
            p_ws_id
        );

        v_should_send_push := public.should_send_notification(
            v_target_user_id,
            v_notification_key,
            'push',
            p_scope,
            p_ws_id
        );
    ELSE
        v_should_send_web := TRUE;
        v_should_send_email := TRUE;
        v_should_send_push := FALSE;
    END IF;

    v_should_create_notification :=
        COALESCE(v_should_send_web, FALSE)
        OR COALESCE(v_should_send_email, FALSE)
        OR COALESCE(v_should_send_push, FALSE);

    IF v_should_create_notification THEN
        INSERT INTO public.notifications (
            ws_id,
            user_id,
            email,
            type,
            code,
            title,
            description,
            data,
            entity_type,
            entity_id,
            created_by,
            scope,
            priority
        ) VALUES (
            p_ws_id,
            v_target_user_id,
            v_target_email,
            p_type,
            p_code,
            p_title,
            p_description,
            p_data,
            p_entity_type,
            p_entity_id,
            p_created_by,
            p_scope,
            v_final_priority
        )
        RETURNING id INTO v_notification_id;

        IF v_should_send_email AND v_target_email IS NOT NULL THEN
            v_email_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'email',
                v_email_batch_window,
                v_target_email,
                v_email_delivery_mode
            );

            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'email',
                'pending',
                v_email_batch_id
            );

            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_email_batch_id;
        END IF;

        IF v_should_send_push AND v_target_user_id IS NOT NULL THEN
            v_push_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'push',
                v_push_batch_window,
                NULL,
                v_push_delivery_mode
            );

            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'push',
                'pending',
                v_push_batch_id
            );

            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_push_batch_id;
        END IF;

        RETURN v_notification_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.notify_time_tracking_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requester_name TEXT;
    v_request_title TEXT;
    v_recipient RECORD;
    v_data JSONB;
BEGIN
    v_request_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Request');

    SELECT COALESCE(NULLIF(display_name, ''), 'Someone')
    INTO v_requester_name
    FROM public.users
    WHERE id = NEW.user_id;

    v_requester_name := COALESCE(v_requester_name, 'Someone');

    v_data := jsonb_build_object(
        'request_id', NEW.id,
        'request_title', v_request_title,
        'approval_status', NEW.approval_status,
        'start_time', NEW.start_time,
        'end_time', NEW.end_time,
        'requester_name', v_requester_name
    );

    FOR v_recipient IN
        SELECT wm.user_id
        FROM public.workspace_members wm
        WHERE wm.ws_id = NEW.workspace_id
          AND wm.user_id <> NEW.user_id
          AND public.has_workspace_permission(
              NEW.workspace_id,
              wm.user_id,
              'manage_time_tracking_requests'
          )
    LOOP
        PERFORM public.create_notification(
            p_ws_id := NEW.workspace_id,
            p_user_id := v_recipient.user_id,
            p_type := 'time_tracking_request_submitted',
            p_title := 'Time tracking request submitted',
            p_description := v_requester_name || ' submitted "' || v_request_title || '" for approval',
            p_data := v_data,
            p_entity_type := 'time_tracking_request',
            p_entity_id := NEW.id,
            p_created_by := NEW.user_id
        );
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_time_tracking_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_title TEXT;
    v_actor_id UUID;
    v_actor_name TEXT;
    v_data JSONB;
    v_recipient RECORD;
BEGIN
    IF OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status THEN
        RETURN NEW;
    END IF;

    v_request_title := COALESCE(NULLIF(NEW.title, ''), 'Untitled Request');
    v_actor_id := COALESCE(
        auth.uid(),
        NEW.approved_by,
        NEW.rejected_by,
        NEW.needs_info_requested_by,
        NEW.user_id
    );

    SELECT COALESCE(NULLIF(display_name, ''), 'Someone')
    INTO v_actor_name
    FROM public.users
    WHERE id = v_actor_id;

    v_actor_name := COALESCE(v_actor_name, 'Someone');

    IF OLD.approval_status = 'NEEDS_INFO' AND NEW.approval_status = 'PENDING' THEN
        v_data := jsonb_build_object(
            'request_id', NEW.id,
            'request_title', v_request_title,
            'approval_status', NEW.approval_status,
            'previous_status', OLD.approval_status,
            'start_time', NEW.start_time,
            'end_time', NEW.end_time,
            'requester_name', v_actor_name
        );

        FOR v_recipient IN
            SELECT wm.user_id
            FROM public.workspace_members wm
            WHERE wm.ws_id = NEW.workspace_id
              AND wm.user_id <> NEW.user_id
              AND public.has_workspace_permission(
                  NEW.workspace_id,
                  wm.user_id,
                  'manage_time_tracking_requests'
              )
        LOOP
            PERFORM public.create_notification(
                p_ws_id := NEW.workspace_id,
                p_user_id := v_recipient.user_id,
                p_type := 'time_tracking_request_resubmitted',
                p_title := 'Time tracking request resubmitted',
                p_description := v_actor_name || ' resubmitted "' || v_request_title || '" for approval',
                p_data := v_data,
                p_entity_type := 'time_tracking_request',
                p_entity_id := NEW.id,
                p_created_by := NEW.user_id
            );
        END LOOP;

        RETURN NEW;
    END IF;

    IF NEW.user_id = v_actor_id THEN
        RETURN NEW;
    END IF;

    IF NEW.approval_status = 'APPROVED' THEN
        v_data := jsonb_build_object(
            'request_id', NEW.id,
            'request_title', v_request_title,
            'approval_status', NEW.approval_status,
            'approved_at', NEW.approved_at,
            'reviewer_name', v_actor_name
        );

        PERFORM public.create_notification(
            p_ws_id := NEW.workspace_id,
            p_user_id := NEW.user_id,
            p_type := 'time_tracking_request_approved',
            p_title := 'Time tracking request approved',
            p_description := v_actor_name || ' approved "' || v_request_title || '"',
            p_data := v_data,
            p_entity_type := 'time_tracking_request',
            p_entity_id := NEW.id,
            p_created_by := v_actor_id
        );
    ELSIF NEW.approval_status = 'REJECTED' THEN
        v_data := jsonb_build_object(
            'request_id', NEW.id,
            'request_title', v_request_title,
            'approval_status', NEW.approval_status,
            'rejected_at', NEW.rejected_at,
            'reviewer_name', v_actor_name,
            'rejection_reason', NEW.rejection_reason
        );

        PERFORM public.create_notification(
            p_ws_id := NEW.workspace_id,
            p_user_id := NEW.user_id,
            p_type := 'time_tracking_request_rejected',
            p_title := 'Time tracking request rejected',
            p_description := v_actor_name || ' rejected "' || v_request_title || '"',
            p_data := v_data,
            p_entity_type := 'time_tracking_request',
            p_entity_id := NEW.id,
            p_created_by := v_actor_id
        );
    ELSIF NEW.approval_status = 'NEEDS_INFO' THEN
        v_data := jsonb_build_object(
            'request_id', NEW.id,
            'request_title', v_request_title,
            'approval_status', NEW.approval_status,
            'needs_info_requested_at', NEW.needs_info_requested_at,
            'reviewer_name', v_actor_name,
            'needs_info_reason', NEW.needs_info_reason
        );

        PERFORM public.create_notification(
            p_ws_id := NEW.workspace_id,
            p_user_id := NEW.user_id,
            p_type := 'time_tracking_request_needs_info',
            p_title := 'Time tracking request needs more information',
            p_description := v_actor_name || ' requested more information for "' || v_request_title || '"',
            p_data := v_data,
            p_entity_type := 'time_tracking_request',
            p_entity_id := NEW.id,
            p_created_by := v_actor_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_time_tracking_request_submitted
ON public.time_tracking_requests;

CREATE TRIGGER trg_notify_time_tracking_request_submitted
    AFTER INSERT ON public.time_tracking_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_time_tracking_request_submitted();

DROP TRIGGER IF EXISTS trg_notify_time_tracking_request_status_change
ON public.time_tracking_requests;

CREATE TRIGGER trg_notify_time_tracking_request_status_change
    AFTER UPDATE ON public.time_tracking_requests
    FOR EACH ROW
    WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
    EXECUTE FUNCTION public.notify_time_tracking_request_status_change();
