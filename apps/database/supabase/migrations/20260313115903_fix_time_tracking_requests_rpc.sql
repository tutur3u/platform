-- Restore server-side request updates after public table privileges were revoked.
-- Tighten the RPC to derive bypass privileges inside SQL and enforce all
-- authorization inside the function instead of relying on table grants/RLS.

DROP FUNCTION IF EXISTS public.update_time_tracking_request(uuid, text, uuid, boolean, text, text);

CREATE OR REPLACE FUNCTION public.update_time_tracking_request(
    p_request_id uuid,
    p_action text,
    p_workspace_id uuid,
    p_rejection_reason text DEFAULT NULL::text,
    p_needs_info_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_request public.time_tracking_requests%ROWTYPE;
    v_session_id uuid;
    v_duration_seconds integer;
    v_actor_id uuid := auth.uid();
    v_is_workspace_member boolean := false;
    v_has_manage_permission boolean := false;
    v_can_bypass boolean := false;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE ws_id = p_workspace_id
          AND user_id = v_actor_id
    )
    INTO v_is_workspace_member;

    IF NOT v_is_workspace_member THEN
        RAISE EXCEPTION 'Workspace access denied';
    END IF;

    v_has_manage_permission := public.has_workspace_permission(
        p_workspace_id,
        v_actor_id,
        'manage_time_tracking_requests'
    );

    v_can_bypass := public.has_workspace_permission(
        p_workspace_id,
        v_actor_id,
        'bypass_time_tracking_request_approval'
    );

    SELECT *
    INTO v_request
    FROM public.time_tracking_requests
    WHERE id = p_request_id
      AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time tracking request not found';
    END IF;

    IF p_action IN ('approve', 'reject', 'needs_info') AND NOT v_has_manage_permission THEN
        RAISE EXCEPTION 'You do not have permission to manage time tracking requests';
    END IF;

    -- ======================================================================
    -- ACTION: APPROVE
    -- ======================================================================
    IF p_action = 'approve' THEN
        IF v_request.approval_status <> 'PENDING' THEN
            RAISE EXCEPTION 'Request has already been %', lower(v_request.approval_status);
        END IF;

        IF NOT v_can_bypass AND v_request.user_id = v_actor_id THEN
            RAISE EXCEPTION 'Request owner cannot approve their own request';
        END IF;

        PERFORM set_config('time_tracking.bypass_approval_rules', 'on', true);

        v_duration_seconds := extract(epoch from (v_request.end_time - v_request.start_time))::integer;

        PERFORM set_config('time_tracking.bypass_insert_limit', 'on', true);

        IF v_request.linked_session_id IS NOT NULL THEN
            v_session_id := v_request.linked_session_id;
        ELSE
            INSERT INTO public.time_tracking_sessions (
                ws_id,
                user_id,
                title,
                description,
                category_id,
                task_id,
                start_time,
                end_time,
                duration_seconds
            ) VALUES (
                v_request.workspace_id,
                v_request.user_id,
                v_request.title,
                v_request.description,
                v_request.category_id,
                v_request.task_id,
                v_request.start_time,
                v_request.end_time,
                v_duration_seconds
            )
            RETURNING id INTO v_session_id;
        END IF;

        UPDATE public.time_tracking_requests
        SET
            approval_status = 'APPROVED',
            approved_by = v_actor_id,
            approved_at = now(),
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Request approved and time tracking session created',
            'session_id', v_session_id
        );

    -- ======================================================================
    -- ACTION: REJECT
    -- ======================================================================
    ELSIF p_action = 'reject' THEN
        IF v_request.approval_status <> 'PENDING' THEN
            RAISE EXCEPTION 'Request has already been %', lower(v_request.approval_status);
        END IF;

        IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
            RAISE EXCEPTION 'Rejection reason is required';
        END IF;

        IF NOT v_can_bypass AND v_request.user_id = v_actor_id THEN
            RAISE EXCEPTION 'Request owner cannot reject their own request';
        END IF;

        PERFORM set_config('time_tracking.bypass_approval_rules', 'on', true);

        UPDATE public.time_tracking_requests
        SET
            approval_status = 'REJECTED',
            rejected_by = v_actor_id,
            rejected_at = now(),
            rejection_reason = p_rejection_reason,
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Request rejected'
        );

    -- ======================================================================
    -- ACTION: NEEDS_INFO
    -- ======================================================================
    ELSIF p_action = 'needs_info' THEN
        IF v_request.approval_status <> 'PENDING' THEN
            RAISE EXCEPTION 'Can only request more info from PENDING status, current status: %', v_request.approval_status;
        END IF;

        IF p_needs_info_reason IS NULL OR trim(p_needs_info_reason) = '' THEN
            RAISE EXCEPTION 'Reason for requesting more information is required';
        END IF;

        IF NOT v_can_bypass AND v_request.user_id = v_actor_id THEN
            RAISE EXCEPTION 'Request owner cannot request info on their own request';
        END IF;

        PERFORM set_config('time_tracking.bypass_approval_rules', 'on', true);

        UPDATE public.time_tracking_requests
        SET
            approval_status = 'NEEDS_INFO',
            needs_info_requested_by = v_actor_id,
            needs_info_requested_at = now(),
            needs_info_reason = p_needs_info_reason,
            updated_at = now()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Request marked as needing more information'
        );

    -- ======================================================================
    -- ACTION: RESUBMIT
    -- ======================================================================
    ELSIF p_action = 'resubmit' THEN
        IF v_request.approval_status <> 'NEEDS_INFO' THEN
            RAISE EXCEPTION 'Can only resubmit from NEEDS_INFO status, current status: %', v_request.approval_status;
        END IF;

        IF v_request.user_id <> v_actor_id THEN
            RAISE EXCEPTION 'Only the request owner can resubmit the request';
        END IF;

        PERFORM set_config('time_tracking.bypass_approval_rules', 'on', true);

        UPDATE public.time_tracking_requests
        SET
            approval_status = 'PENDING',
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Request resubmitted for approval'
        );

    ELSE
        RAISE EXCEPTION 'Invalid action. Must be "approve", "reject", "needs_info", or "resubmit"';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_time_tracking_request(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_time_tracking_request(uuid, text, uuid, text, text) TO authenticated;
