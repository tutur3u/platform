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
