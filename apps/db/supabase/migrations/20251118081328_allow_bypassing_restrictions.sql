
-- Trigger function to enforce field immutability rules
create or replace function check_time_tracking_request_update()
returns trigger as $$
begin
    -- If user is NOT the owner (approver path)
    if NEW.user_id <> auth.uid() then
        -- Ensure content fields are not modified
        if NEW.title <> OLD.title 
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.start_time <> OLD.start_time
            OR NEW.end_time <> OLD.end_time
            OR NEW.task_id IS DISTINCT FROM OLD.task_id
            OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.images IS DISTINCT FROM OLD.images then
            raise exception 'Approvers cannot modify request content fields';
        end if;
        
        -- Ensure ownership/creation fields are not modified
        if NEW.user_id <> OLD.user_id 
            OR NEW.workspace_id <> OLD.workspace_id 
            OR NEW.created_at <> OLD.created_at then
            raise exception 'Cannot modify ownership or creation fields';
        end if;
        
        -- Validate approval/rejection data integrity
        if NEW.approval_status = 'APPROVED' then
            if NEW.approved_by <> auth.uid() OR NEW.approved_at IS NULL then
                raise exception 'Invalid approval data';
            end if;
            if NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL then
                raise exception 'Cannot have rejection data when approving';
            end if;
        elsif NEW.approval_status = 'REJECTED' then
            if NEW.rejected_by <> auth.uid() OR NEW.rejected_at IS NULL OR NEW.rejection_reason IS NULL then
                raise exception 'Invalid rejection data';
            end if;
            if NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL then
                raise exception 'Cannot have approval data when rejecting';
            end if;
        end if;
    end if;
    
    -- If user IS the owner, check for bypass flag to allow approval status change
    if NEW.user_id = auth.uid() then
        if NEW.approval_status <> OLD.approval_status then
            -- Check for the bypass flag set in the current session.
            -- Set this using: SET time_tracking.bypass_approval_rules = 'on';
            if current_setting('time_tracking.bypass_approval_rules', true) <> 'on' then
                raise exception 'Request owner cannot change approval status';
            end if;
        end if;
    end if;
    
    return NEW;
end;
$$ language plpgsql security invoker;

-- RPC function to update time tracking request with centralized logic
create or replace function update_time_tracking_request(
    p_request_id uuid,
    p_action text,
    p_workspace_id uuid,
    p_bypass_rules boolean default false,
    p_rejection_reason text default null
)
returns jsonb as $$
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

    -- Check if already processed
    if v_request.approval_status <> 'PENDING' then
        raise exception 'Request has already been %', lower(v_request.approval_status);
    end if;

    if p_action = 'approve' then

        if not p_bypass_rules then
            -- Enforce that the approver is not the request owner
            if v_request.user_id = auth.uid() then
                raise exception 'Request owner cannot approve their own request';
            end if;
        end if;

        perform set_config('time_tracking.bypass_approval_rules', 'on', true);
        -- Update the request
        update time_tracking_requests
        set 
            approval_status = 'APPROVED',
            approved_by = auth.uid(),
            approved_at = now(),
            updated_at = now()
        where id = p_request_id;

        -- Calculate duration
        v_duration_seconds := extract(epoch from (v_request.end_time - v_request.start_time))::integer;

        -- Set bypass flag to allow creating session with approved request data
        perform set_config('time_tracking.bypass_insert_limit', 'on', true);

        -- Create the time tracking session
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

        return jsonb_build_object(
            'success', true,
            'message', 'Request approved and time tracking session created',
            'session_id', v_session_id
        );

    elsif p_action = 'reject' then
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
            updated_at = now()
        where id = p_request_id;

        return jsonb_build_object(
            'success', true,
            'message', 'Request rejected'
        );

    else
        raise exception 'Invalid action. Must be "approve" or "reject"';
    end if;
end;
$$ language plpgsql security definer;