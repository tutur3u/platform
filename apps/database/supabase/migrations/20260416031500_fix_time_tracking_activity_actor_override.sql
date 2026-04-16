-- Ensure activity logging records actor_id when request updates are performed
-- through SECURITY DEFINER RPCs that proxy the authenticated user via
-- time_tracking.override_auth_uid.

CREATE OR REPLACE FUNCTION public.log_time_tracking_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_fields JSONB := '{}'::JSONB;
    v_status_changed BOOLEAN := FALSE;
    v_content_changed BOOLEAN := FALSE;
    v_actor_override text := NULLIF(current_setting('time_tracking.override_auth_uid', true), '');
    v_actor_id uuid := COALESCE(v_actor_override::uuid, auth.uid());
BEGIN
    -- Track status changes
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
        v_status_changed := TRUE;
    END IF;

    -- Track content field changes
    IF OLD.title IS DISTINCT FROM NEW.title THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{title}', jsonb_build_object('old', OLD.title, 'new', NEW.title));
        v_content_changed := TRUE;
    END IF;

    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{description}', jsonb_build_object('old', OLD.description, 'new', NEW.description));
        v_content_changed := TRUE;
    END IF;

    IF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{start_time}', jsonb_build_object('old', OLD.start_time, 'new', NEW.start_time));
        v_content_changed := TRUE;
    END IF;

    IF OLD.end_time IS DISTINCT FROM NEW.end_time THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{end_time}', jsonb_build_object('old', OLD.end_time, 'new', NEW.end_time));
        v_content_changed := TRUE;
    END IF;

    IF OLD.task_id IS DISTINCT FROM NEW.task_id THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{task_id}', jsonb_build_object('old', OLD.task_id, 'new', NEW.task_id));
        v_content_changed := TRUE;
    END IF;

    IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{category_id}', jsonb_build_object('old', OLD.category_id, 'new', NEW.category_id));
        v_content_changed := TRUE;
    END IF;

    IF OLD.images IS DISTINCT FROM NEW.images THEN
        v_changed_fields := jsonb_set(v_changed_fields, '{images}', jsonb_build_object('old', OLD.images, 'new', NEW.images));
        v_content_changed := TRUE;
    END IF;

    -- Status/content updates should always have an actor.
    IF (v_status_changed OR v_content_changed) AND v_actor_id IS NULL THEN
        RAISE EXCEPTION 'User authentication required for time tracking request activity updates';
    END IF;

    -- Log status change separately with feedback preservation
    IF v_status_changed THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            previous_status,
            new_status,
            feedback_reason,
            metadata
        ) VALUES (
            NEW.id,
            'STATUS_CHANGED',
            v_actor_id,
            OLD.approval_status::TEXT,
            NEW.approval_status::TEXT,
            CASE
                WHEN NEW.approval_status::TEXT = 'NEEDS_INFO' AND NEW.needs_info_reason IS NOT NULL
                THEN NEW.needs_info_reason
                WHEN NEW.approval_status::TEXT = 'REJECTED' AND NEW.rejection_reason IS NOT NULL
                THEN NEW.rejection_reason
                ELSE NULL
            END,
            jsonb_build_object(
                'approved_by', NEW.approved_by,
                'rejected_by', NEW.rejected_by,
                'needs_info_requested_by', NEW.needs_info_requested_by
            )
        );
    END IF;

    -- Log content changes
    IF v_content_changed THEN
        INSERT INTO time_tracking_request_activity (
            request_id,
            action_type,
            actor_id,
            changed_fields
        ) VALUES (
            NEW.id,
            'CONTENT_UPDATED',
            v_actor_id,
            v_changed_fields
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
