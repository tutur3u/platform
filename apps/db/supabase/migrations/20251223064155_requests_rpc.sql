-- =============================================================================
-- Update Time Tracking Request RPC to Support NEEDS_INFO Flow
-- Adds: 'needs_info' action for approvers, 'resubmit' action for owners
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_time_tracking_request;

CREATE OR REPLACE FUNCTION public.update_time_tracking_request(
    p_request_id uuid, 
    p_action text, 
    p_workspace_id uuid, 
    p_bypass_rules boolean DEFAULT false, 
    p_rejection_reason text DEFAULT NULL::text,
    p_needs_info_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
    v_request record;
    v_session_id uuid;
    v_duration_seconds integer;
begin
    -- Get the current request and validate workspace
    select * into v_request
    from time_tracking_requests
    where id = p_request_id
    and workspace_id = p_workspace_id
    and workspace_id in (
        select ws_id from workspace_members where user_id = auth.uid()
    );

    if not found then
        raise exception 'Time tracking request not found';
    end if;

    -- ==========================================================================
    -- ACTION: APPROVE
    -- ==========================================================================
    if p_action = 'approve' then
        -- Check if already processed (can only approve from PENDING)
        if v_request.approval_status <> 'PENDING' then
            raise exception 'Request has already been %', lower(v_request.approval_status);
        end if;

        if not p_bypass_rules then
            -- Enforce that the approver is not the request owner
            if v_request.user_id = auth.uid() then
                raise exception 'Request owner cannot approve their own request';
            end if;
        end if;

        perform set_config('time_tracking.bypass_approval_rules', 'on', true);
        
        -- Calculate duration
        v_duration_seconds := extract(epoch from (v_request.end_time - v_request.start_time))::integer;

        -- Set bypass flag to allow creating session with approved request data
        perform set_config('time_tracking.bypass_insert_limit', 'on', true);

        -- If request has a linked_session_id, update that session instead of creating a new one
        if v_request.linked_session_id IS NOT NULL then
            -- Session already exists (was paused with break), just update it
            -- The trigger on time_tracking_requests will clear pending_approval
            v_session_id := v_request.linked_session_id;
        else
            -- No linked session, create a new one
            insert into time_tracking_sessions (
                ws_id,
                user_id,
                title,
                description,
                category_id,
                task_id,
                start_time,
                end_time,
                duration_seconds
            ) values (
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
            returning id into v_session_id;
        end if;

        -- Update the request
        update time_tracking_requests
        set 
            approval_status = 'APPROVED',
            approved_by = auth.uid(),
            approved_at = now(),
            -- Clear needs_info fields if previously set
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        where id = p_request_id;

        return jsonb_build_object(
            'success', true,
            'message', 'Request approved and time tracking session created',
            'session_id', v_session_id
        );

    -- ==========================================================================
    -- ACTION: REJECT
    -- ==========================================================================
    elsif p_action = 'reject' then
        -- Check if already processed (can only reject from PENDING)
        if v_request.approval_status <> 'PENDING' then
            raise exception 'Request has already been %', lower(v_request.approval_status);
        end if;

        if p_rejection_reason is null or trim(p_rejection_reason) = '' then
            raise exception 'Rejection reason is required';
        end if;

        if not p_bypass_rules then
            -- Enforce that the approver is not the request owner
            if v_request.user_id = auth.uid() then
                raise exception 'Request owner cannot reject their own request';
            end if;
        end if;

        perform set_config('time_tracking.bypass_approval_rules', 'on', true);

        -- Update the request
        update time_tracking_requests
        set 
            approval_status = 'REJECTED',
            rejected_by = auth.uid(),
            rejected_at = now(),
            rejection_reason = p_rejection_reason,
            -- Clear needs_info fields if previously set
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        where id = p_request_id;

        return jsonb_build_object(
            'success', true,
            'message', 'Request rejected'
        );

    -- ==========================================================================
    -- ACTION: NEEDS_INFO (Request Additional Information)
    -- ==========================================================================
    elsif p_action = 'needs_info' then
        -- Check if status is valid (can only request info from PENDING)
        if v_request.approval_status <> 'PENDING' then
            raise exception 'Can only request more info from PENDING status, current status: %', v_request.approval_status;
        end if;

        if p_needs_info_reason is null or trim(p_needs_info_reason) = '' then
            raise exception 'Reason for requesting more information is required';
        end if;

        if not p_bypass_rules then
            -- Enforce that the approver is not the request owner
            if v_request.user_id = auth.uid() then
                raise exception 'Request owner cannot request info on their own request';
            end if;
        end if;

        perform set_config('time_tracking.bypass_approval_rules', 'on', true);

        -- Update the request
        update time_tracking_requests
        set 
            approval_status = 'NEEDS_INFO',
            needs_info_requested_by = auth.uid(),
            needs_info_requested_at = now(),
            needs_info_reason = p_needs_info_reason,
            updated_at = now()
        where id = p_request_id;

        return jsonb_build_object(
            'success', true,
            'message', 'Request marked as needing more information'
        );

    -- ==========================================================================
    -- ACTION: RESUBMIT (Owner resubmits after providing info)
    -- ==========================================================================
    elsif p_action = 'resubmit' then
        -- Check if status is valid (can only resubmit from NEEDS_INFO)
        if v_request.approval_status <> 'NEEDS_INFO' then
            raise exception 'Can only resubmit from NEEDS_INFO status, current status: %', v_request.approval_status;
        end if;

        -- Only the request owner can resubmit
        if v_request.user_id <> auth.uid() then
            raise exception 'Only the request owner can resubmit the request';
        end if;

        perform set_config('time_tracking.bypass_approval_rules', 'on', true);

        -- Update the request - clear needs_info fields and set back to PENDING
        update time_tracking_requests
        set 
            approval_status = 'PENDING',
            needs_info_requested_by = NULL,
            needs_info_requested_at = NULL,
            needs_info_reason = NULL,
            updated_at = now()
        where id = p_request_id;

        return jsonb_build_object(
            'success', true,
            'message', 'Request resubmitted for approval'
        );

    else
        raise exception 'Invalid action. Must be "approve", "reject", "needs_info", or "resubmit"';
    end if;
end;
$function$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_time_tracking_request TO authenticated;


-- =============================================================================
-- Allow Request Owners with Manage Permission to Approve/Reject Like Approvers
-- Updates the trigger to check if owner has manage_time_tracking_requests permission
-- Owners with manage permission can EITHER modify content OR change approval status
-- =============================================================================

CREATE OR REPLACE FUNCTION check_time_tracking_request_update()
RETURNS TRIGGER AS $$
DECLARE
    v_has_manage_permission BOOLEAN;
    v_content_changed BOOLEAN;
    v_status_changed BOOLEAN;
BEGIN
    -- Check if the current user has manage_time_tracking_requests permission
    v_has_manage_permission := has_workspace_permission(
        NEW.workspace_id, 
        auth.uid(), 
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

    -- Ensure ownership/creation fields are never modified
    IF NEW.user_id <> OLD.user_id 
        OR NEW.workspace_id <> OLD.workspace_id 
        OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Cannot modify ownership or creation fields';
    END IF;

    -- =========================================================================
    -- NON-OWNER APPROVER PATH: User is NOT the owner
    -- =========================================================================
    IF NEW.user_id <> auth.uid() AND v_has_manage_permission THEN
        -- Non-owners cannot modify content fields
        IF v_content_changed THEN
            RAISE EXCEPTION 'Approvers cannot modify request content fields';
        END IF;
        
        -- Validate status transitions for approvers
        IF NEW.approval_status = 'APPROVED' THEN
            IF OLD.approval_status <> 'PENDING' THEN
                RAISE EXCEPTION 'Can only approve from PENDING status';
            END IF;
            IF NEW.approved_by <> auth.uid() OR NEW.approved_at IS NULL THEN
                RAISE EXCEPTION 'Invalid approval data';
            END IF;
            IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot have rejection data when approving';
            END IF;
            IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot have needs_info data when approving';
            END IF;
            
        ELSIF NEW.approval_status = 'REJECTED' THEN
            IF OLD.approval_status <> 'PENDING' THEN
                RAISE EXCEPTION 'Can only reject from PENDING status';
            END IF;
            IF NEW.rejected_by <> auth.uid() OR NEW.rejected_at IS NULL OR NEW.rejection_reason IS NULL THEN
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
            IF NEW.needs_info_requested_by <> auth.uid() OR NEW.needs_info_requested_at IS NULL OR NEW.needs_info_reason IS NULL THEN
                RAISE EXCEPTION 'Invalid needs_info data';
            END IF;
            IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot have approval data when requesting info';
            END IF;
            IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot have rejection data when requesting info';
            END IF;
        END IF;
    END IF;
    
    -- =========================================================================
    -- OWNER WITH MANAGE PERMISSION PATH
    -- =========================================================================
    IF NEW.user_id = auth.uid() AND v_has_manage_permission THEN
        -- Owner with manage permission can either:
        -- 1. Modify content fields (when status is PENDING or NEEDS_INFO)
        -- 2. Change approval status (acting as approver)
        -- But not both in the same update
        
        IF v_content_changed AND v_status_changed THEN
            RAISE EXCEPTION 'Cannot modify content and change approval status in the same update';
        END IF;
        
        -- If changing status, apply approver validation rules
        IF v_status_changed THEN
            IF NEW.approval_status = 'APPROVED' THEN
                IF OLD.approval_status <> 'PENDING' THEN
                    RAISE EXCEPTION 'Can only approve from PENDING status';
                END IF;
                IF NEW.approved_by <> auth.uid() OR NEW.approved_at IS NULL THEN
                    RAISE EXCEPTION 'Invalid approval data';
                END IF;
                IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have rejection data when approving';
                END IF;
                IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have needs_info data when approving';
                END IF;
                
            ELSIF NEW.approval_status = 'REJECTED' THEN
                IF OLD.approval_status <> 'PENDING' THEN
                    RAISE EXCEPTION 'Can only reject from PENDING status';
                END IF;
                IF NEW.rejected_by <> auth.uid() OR NEW.rejected_at IS NULL OR NEW.rejection_reason IS NULL THEN
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
                IF NEW.needs_info_requested_by <> auth.uid() OR NEW.needs_info_requested_at IS NULL OR NEW.needs_info_reason IS NULL THEN
                    RAISE EXCEPTION 'Invalid needs_info data';
                END IF;
                IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have approval data when requesting info';
                END IF;
                IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot have rejection data when requesting info';
                END IF;
                
            ELSIF NEW.approval_status = 'PENDING' THEN
                -- Resubmitting from NEEDS_INFO
                IF OLD.approval_status <> 'NEEDS_INFO' THEN
                    RAISE EXCEPTION 'Can only resubmit to PENDING from NEEDS_INFO status';
                END IF;
                IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                    RAISE EXCEPTION 'Must clear needs_info fields when resubmitting';
                END IF;
            END IF;
        END IF;
        
        -- If modifying content, ensure status is PENDING or NEEDS_INFO
        IF v_content_changed THEN
            IF OLD.approval_status NOT IN ('PENDING', 'NEEDS_INFO') THEN
                RAISE EXCEPTION 'Can only modify content when request is PENDING or NEEDS_INFO';
            END IF;
        END IF;
    END IF;
    
    -- =========================================================================
    -- OWNER WITHOUT MANAGE PERMISSION PATH
    -- =========================================================================
    IF NEW.user_id = auth.uid() AND NOT v_has_manage_permission THEN
        -- Owner can only change status from NEEDS_INFO to PENDING (resubmit)
        IF v_status_changed THEN
            IF NOT (OLD.approval_status = 'NEEDS_INFO' AND NEW.approval_status = 'PENDING') THEN
                RAISE EXCEPTION 'Request owner can only resubmit from NEEDS_INFO to PENDING status';
            END IF;
            -- When resubmitting, clear the needs_info fields
            IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Must clear needs_info fields when resubmitting';
            END IF;
        END IF;
        
        -- Owner can modify content when status is PENDING or NEEDS_INFO
        IF v_content_changed THEN
            IF OLD.approval_status NOT IN ('PENDING', 'NEEDS_INFO') THEN
                RAISE EXCEPTION 'Can only modify content when request is PENDING or NEEDS_INFO';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
