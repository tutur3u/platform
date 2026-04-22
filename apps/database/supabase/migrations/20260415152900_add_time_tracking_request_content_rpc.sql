-- Add a content-edit RPC for time tracking requests that can run through the
-- admin client while preserving the authenticated actor for trigger checks.

CREATE OR REPLACE FUNCTION public.update_time_tracking_request_content(
    p_request_id uuid,
    p_workspace_id uuid,
    p_actor_auth_uid uuid,
    p_title text,
    p_description text DEFAULT NULL::text,
    p_start_time timestamptz DEFAULT NULL::timestamptz,
    p_end_time timestamptz DEFAULT NULL::timestamptz,
    p_images text[] DEFAULT NULL::text[]
)
RETURNS public.time_tracking_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_request public.time_tracking_requests%ROWTYPE;
    v_updated_request public.time_tracking_requests%ROWTYPE;
    v_is_workspace_member boolean := false;
BEGIN
    IF p_actor_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE ws_id = p_workspace_id
          AND user_id = p_actor_auth_uid
    )
    INTO v_is_workspace_member;

    IF NOT v_is_workspace_member THEN
        RAISE EXCEPTION 'Workspace access denied';
    END IF;

    SELECT *
    INTO v_request
    FROM public.time_tracking_requests
    WHERE id = p_request_id
      AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time tracking request not found';
    END IF;

    IF v_request.user_id <> p_actor_auth_uid THEN
        RAISE EXCEPTION 'Only the request owner can edit this request';
    END IF;

    IF v_request.approval_status NOT IN ('PENDING', 'NEEDS_INFO') THEN
        RAISE EXCEPTION 'Request can only be edited when status is Pending or Needs Info';
    END IF;

    PERFORM set_config(
        'time_tracking.override_auth_uid',
        p_actor_auth_uid::text,
        true
    );

    UPDATE public.time_tracking_requests
    SET
        title = p_title,
        description = p_description,
        start_time = p_start_time,
        end_time = p_end_time,
        images = CASE
            WHEN p_images IS NULL OR cardinality(p_images) = 0 THEN NULL
            ELSE p_images
        END,
        updated_at = now()
    WHERE id = p_request_id
      AND workspace_id = p_workspace_id
    RETURNING *
    INTO v_updated_request;

    RETURN v_updated_request;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_time_tracking_request_content(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_time_tracking_request_content(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_time_tracking_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_override text := NULLIF(current_setting('time_tracking.override_auth_uid', true), '');
    v_actor_id uuid := COALESCE(v_actor_override::uuid, auth.uid());
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
                    RAISE EXCEPTION 'Needs info fields must be cleared when resubmitting';
                END IF;
                IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have approval data when resubmitting';
                END IF;
                IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have rejection data when resubmitting';
                END IF;
            ELSE
                RAISE EXCEPTION 'Invalid approval status transition';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- =========================================================================
    -- OWNER-ONLY PATH: User is the owner and does NOT have manage permission
    -- =========================================================================
    IF v_status_changed THEN
        RAISE EXCEPTION 'Request owners cannot change approval status';
    END IF;

    IF NOT v_content_changed THEN
        RAISE EXCEPTION 'No editable request fields changed';
    END IF;

    IF OLD.approval_status <> 'PENDING' AND OLD.approval_status <> 'NEEDS_INFO' THEN
        RAISE EXCEPTION 'Only pending or needs-info requests can be edited';
    END IF;

    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
        OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
        OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        OR NEW.needs_info_requested_by IS DISTINCT FROM OLD.needs_info_requested_by
        OR NEW.needs_info_requested_at IS DISTINCT FROM OLD.needs_info_requested_at
        OR NEW.needs_info_reason IS DISTINCT FROM OLD.needs_info_reason
        OR NEW.linked_session_id IS DISTINCT FROM OLD.linked_session_id THEN
        RAISE EXCEPTION 'Request owners cannot modify approval metadata';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
