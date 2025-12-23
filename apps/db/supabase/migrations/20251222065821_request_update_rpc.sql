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
