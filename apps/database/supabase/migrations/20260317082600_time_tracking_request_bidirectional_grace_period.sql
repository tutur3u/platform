-- Allow APPROVED <-> REJECTED transitions within configurable grace period.

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
    v_status_change_grace_period_minutes integer := 0;
    v_approved_to_rejected_allowed boolean := false;
    v_rejected_to_approved_allowed boolean := false;
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

    SELECT
        COALESCE(
            (
                SELECT value::integer
                FROM public.workspace_configs
                WHERE ws_id = p_workspace_id
                  AND id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
                  AND value ~ '^[0-9]+$'
                LIMIT 1
            ),
            0
        )
    INTO v_status_change_grace_period_minutes;

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

    v_approved_to_rejected_allowed := (
        v_request.approval_status = 'APPROVED'
        AND v_status_change_grace_period_minutes > 0
        AND v_request.approved_at IS NOT NULL
        AND now() <= (v_request.approved_at + make_interval(mins => v_status_change_grace_period_minutes))
    );

    v_rejected_to_approved_allowed := (
        v_request.approval_status = 'REJECTED'
        AND v_status_change_grace_period_minutes > 0
        AND v_request.rejected_at IS NOT NULL
        AND now() <= (v_request.rejected_at + make_interval(mins => v_status_change_grace_period_minutes))
    );

    -- ======================================================================
    -- ACTION: APPROVE
    -- ======================================================================
    IF p_action = 'approve' THEN
        IF v_request.approval_status <> 'PENDING' AND NOT v_rejected_to_approved_allowed THEN
            IF v_request.approval_status = 'REJECTED' THEN
                RAISE EXCEPTION 'Status change grace period has expired';
            END IF;

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
            rejected_by = NULL,
            rejected_at = NULL,
            rejection_reason = NULL,
            linked_session_id = COALESCE(linked_session_id, v_session_id),
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
                WHERE id = p_request_id
                    AND workspace_id = p_workspace_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Request approved and time tracking session created',
            'session_id', v_session_id
        );

    -- ======================================================================
    -- ACTION: REJECT
    -- ======================================================================
    ELSIF p_action = 'reject' THEN
        IF v_request.approval_status <> 'PENDING' AND NOT v_approved_to_rejected_allowed THEN
            IF v_request.approval_status = 'APPROVED' THEN
                RAISE EXCEPTION 'Status change grace period has expired';
            END IF;

            RAISE EXCEPTION 'Request has already been %', lower(v_request.approval_status);
        END IF;

        IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
            RAISE EXCEPTION 'Rejection reason is required';
        END IF;

        IF NOT v_can_bypass AND v_request.user_id = v_actor_id THEN
            RAISE EXCEPTION 'Request owner cannot reject their own request';
        END IF;

        PERFORM set_config('time_tracking.bypass_approval_rules', 'on', true);

        v_session_id := v_request.linked_session_id;

        IF v_session_id IS NOT NULL THEN
            DELETE FROM public.time_tracking_sessions
            WHERE id = v_session_id
              AND ws_id = p_workspace_id;
        END IF;

        UPDATE public.time_tracking_requests
        SET
            approval_status = 'REJECTED',
            approved_by = NULL,
            approved_at = NULL,
            rejected_by = v_actor_id,
            rejected_at = now(),
            rejection_reason = p_rejection_reason,
            linked_session_id = NULL,
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
                WHERE id = p_request_id
                    AND workspace_id = p_workspace_id;

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
                WHERE id = p_request_id
                    AND workspace_id = p_workspace_id;

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
                WHERE id = p_request_id
                    AND workspace_id = p_workspace_id;

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

-- Extend trigger validation to allow REJECTED -> APPROVED
-- within the configured status change grace period.

CREATE OR REPLACE FUNCTION check_time_tracking_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_has_manage_permission BOOLEAN;
    v_content_changed BOOLEAN;
    v_status_changed BOOLEAN;
    v_status_change_grace_period_minutes INTEGER := 0;
    v_can_reject_approved BOOLEAN := FALSE;
    v_can_approve_rejected BOOLEAN := FALSE;
BEGIN
    IF current_setting('time_tracking.bypass_approval_rules', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'User authentication required for time tracking request updates';
    END IF;

    -- Check if the current user has manage_time_tracking_requests permission
    v_has_manage_permission := has_workspace_permission(
        NEW.workspace_id,
        v_actor_id,
        'manage_time_tracking_requests'::text
    );

    -- Detect what type of change is being made
    v_content_changed := (
        NEW.title <> OLD.title
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.start_time <> OLD.start_time
        OR NEW.end_time <> OLD.end_time
        OR NEW.task_id IS DISTINCT FROM OLD.task_id
        OR NEW.category_id IS DISTINCT FROM OLD.category_id
        OR NEW.images IS DISTINCT FROM OLD.images
    );

    v_status_changed := (NEW.approval_status <> OLD.approval_status);

    IF NOT v_status_changed THEN
        IF NEW.linked_session_id IS DISTINCT FROM OLD.linked_session_id
            OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
            OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
            OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
            OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
            OR NEW.needs_info_requested_by IS DISTINCT FROM OLD.needs_info_requested_by
            OR NEW.needs_info_requested_at IS DISTINCT FROM OLD.needs_info_requested_at
            OR NEW.needs_info_reason IS DISTINCT FROM OLD.needs_info_reason THEN
            RAISE EXCEPTION 'Cannot modify system-managed request fields without an approval status transition';
        END IF;
    ELSE
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            IF NOT (
                NEW.approval_status = 'APPROVED'
                OR (
                    OLD.approval_status = 'APPROVED'
                    AND NEW.approval_status = 'REJECTED'
                    AND NEW.approved_by IS NULL
                    AND NEW.approved_at IS NULL
                )
            ) THEN
                RAISE EXCEPTION 'Approval audit fields can only change when transitioning to APPROVED or clearing APPROVED -> REJECTED';
            END IF;
        END IF;

        IF NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
            OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
            OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
            IF NOT (
                NEW.approval_status = 'REJECTED'
                OR (
                    OLD.approval_status = 'REJECTED'
                    AND NEW.approval_status = 'APPROVED'
                    AND NEW.rejected_by IS NULL
                    AND NEW.rejected_at IS NULL
                    AND NEW.rejection_reason IS NULL
                )
            ) THEN
                RAISE EXCEPTION 'Rejection audit fields can only change when transitioning to REJECTED or clearing REJECTED -> APPROVED';
            END IF;
        END IF;

        IF NEW.needs_info_requested_by IS DISTINCT FROM OLD.needs_info_requested_by
            OR NEW.needs_info_requested_at IS DISTINCT FROM OLD.needs_info_requested_at
            OR NEW.needs_info_reason IS DISTINCT FROM OLD.needs_info_reason THEN
            IF NOT (
                NEW.approval_status = 'NEEDS_INFO'
                OR (
                    OLD.approval_status = 'NEEDS_INFO'
                    AND NEW.approval_status = 'PENDING'
                    AND NEW.needs_info_requested_by IS NULL
                    AND NEW.needs_info_requested_at IS NULL
                    AND NEW.needs_info_reason IS NULL
                )
            ) THEN
                RAISE EXCEPTION 'Needs-info audit fields can only change when transitioning to NEEDS_INFO or clearing NEEDS_INFO -> PENDING';
            END IF;
        END IF;

        IF NEW.linked_session_id IS DISTINCT FROM OLD.linked_session_id THEN
            IF NOT (
                NEW.approval_status = 'APPROVED'
                OR (
                    OLD.approval_status = 'APPROVED'
                    AND NEW.approval_status = 'REJECTED'
                    AND NEW.linked_session_id IS NULL
                )
            ) THEN
                RAISE EXCEPTION 'linked_session_id can only change when approving or when reverting APPROVED to REJECTED';
            END IF;
        END IF;
    END IF;

    IF v_status_changed AND (
        (NEW.approval_status = 'REJECTED' AND OLD.approval_status = 'APPROVED')
        OR (NEW.approval_status = 'APPROVED' AND OLD.approval_status = 'REJECTED')
    ) THEN
        SELECT COALESCE(
            (
                SELECT value::integer
                FROM workspace_configs
                WHERE ws_id = NEW.workspace_id
                  AND id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
                  AND value ~ '^[0-9]+$'
                LIMIT 1
            ),
            0
        )
        INTO v_status_change_grace_period_minutes;

        v_can_reject_approved := (
            NEW.approval_status = 'REJECTED'
            AND OLD.approval_status = 'APPROVED'
            AND v_status_change_grace_period_minutes > 0
            AND OLD.approved_at IS NOT NULL
            AND now() <= (OLD.approved_at + make_interval(mins => v_status_change_grace_period_minutes))
        );

        v_can_approve_rejected := (
            NEW.approval_status = 'APPROVED'
            AND OLD.approval_status = 'REJECTED'
            AND v_status_change_grace_period_minutes > 0
            AND OLD.rejected_at IS NOT NULL
            AND now() <= (OLD.rejected_at + make_interval(mins => v_status_change_grace_period_minutes))
        );
    END IF;

    -- Ensure ownership/creation fields are never modified
    IF NEW.user_id <> OLD.user_id
        OR NEW.workspace_id <> OLD.workspace_id
        OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Cannot modify ownership or creation fields';
    END IF;

    -- =========================================================================
    -- NON-OWNER APPROVER PATH: User is NOT the owner
    -- =========================================================================
    IF NEW.user_id <> v_actor_id AND NOT v_has_manage_permission THEN
        RAISE EXCEPTION 'Only approvers can update requests submitted by other users';
    END IF;

    IF v_has_manage_permission THEN
        -- Non-owners cannot modify content fields.
        IF NEW.user_id <> v_actor_id AND v_content_changed THEN
            RAISE EXCEPTION 'Approvers cannot modify request content fields';
        END IF;

        -- Owners with manage permission cannot modify content and status together.
        IF NEW.user_id = v_actor_id AND v_content_changed AND v_status_changed THEN
            RAISE EXCEPTION 'Cannot modify content and change approval status in the same update';
        END IF;

        -- Shared approval-status validation for both owner/non-owner approvers.
        IF v_status_changed THEN
            IF NEW.approval_status = 'APPROVED' THEN
                IF OLD.approval_status <> 'PENDING' AND NOT v_can_approve_rejected THEN
                    RAISE EXCEPTION 'Can only approve from PENDING status';
                END IF;
                IF NEW.approved_by <> v_actor_id OR NEW.approved_at IS NULL THEN
                    RAISE EXCEPTION 'Invalid approval data';
                END IF;
                IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have rejection data when approving';
                END IF;
                IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have needs_info data when approving';
                END IF;

            ELSIF NEW.approval_status = 'REJECTED' THEN
                IF OLD.approval_status = 'APPROVED' THEN
                    IF NOT v_can_reject_approved THEN
                        RAISE EXCEPTION 'Can only reject approved requests within the configured grace period';
                    END IF;
                ELSIF OLD.approval_status <> 'PENDING' THEN
                    RAISE EXCEPTION 'Can only reject from PENDING status';
                END IF;
                IF NEW.rejected_by <> v_actor_id OR NEW.rejected_at IS NULL OR NEW.rejection_reason IS NULL THEN
                    RAISE EXCEPTION 'Invalid rejection data';
                END IF;
                IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have approval data when rejecting';
                END IF;
                IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have needs_info data when rejecting';
                END IF;

            ELSIF NEW.approval_status = 'NEEDS_INFO' THEN
                IF OLD.approval_status <> 'PENDING' THEN
                    RAISE EXCEPTION 'Can only request more info from PENDING status';
                END IF;
                IF NEW.needs_info_requested_by <> v_actor_id OR NEW.needs_info_requested_at IS NULL OR NEW.needs_info_reason IS NULL THEN
                    RAISE EXCEPTION 'Invalid needs_info data';
                END IF;
                IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have approval data when requesting info';
                END IF;
                IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have rejection data when requesting info';
                END IF;

            ELSIF NEW.approval_status = 'PENDING' THEN
                IF OLD.approval_status <> 'NEEDS_INFO' THEN
                    RAISE EXCEPTION 'Can only resubmit to PENDING from NEEDS_INFO status';
                END IF;
                IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Must clear needs_info fields when resubmitting';
                END IF;
            END IF;
        END IF;

        -- Owners with manage permission may edit content only in mutable statuses.
        IF NEW.user_id = v_actor_id AND v_content_changed THEN
            IF OLD.approval_status NOT IN ('PENDING', 'NEEDS_INFO') THEN
                RAISE EXCEPTION 'Can only modify content when request is PENDING or NEEDS_INFO';
            END IF;
        END IF;
    END IF;

    -- =========================================================================
    -- OWNER WITHOUT MANAGE PERMISSION PATH
    -- =========================================================================
    IF NEW.user_id = v_actor_id AND NOT v_has_manage_permission THEN
        IF v_status_changed THEN
            IF NOT (OLD.approval_status = 'NEEDS_INFO' AND NEW.approval_status = 'PENDING') THEN
                RAISE EXCEPTION 'Request owner can only resubmit from NEEDS_INFO to PENDING status';
            END IF;
            IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Must clear needs_info fields when resubmitting';
            END IF;
        END IF;

        IF v_content_changed THEN
            IF OLD.approval_status NOT IN ('PENDING', 'NEEDS_INFO') THEN
                RAISE EXCEPTION 'Can only modify content when request is PENDING or NEEDS_INFO';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS enforce_time_tracking_request_update ON public.time_tracking_requests;
CREATE TRIGGER enforce_time_tracking_request_update
    BEFORE UPDATE ON public.time_tracking_requests
    FOR EACH ROW
    EXECUTE FUNCTION check_time_tracking_request_update();
