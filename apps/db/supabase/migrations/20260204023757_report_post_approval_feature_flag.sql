-- Enable post and report approval by default for all workspaces
-- This migration adds the configuration keys to workspace_configs
-- and updates the approval handlers to respect these configurations.

-- 1. Update handle_report_approval to respect ENABLE_REPORT_APPROVAL
CREATE OR REPLACE FUNCTION public.handle_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_has_approve_permission boolean;
    v_has_create_permission boolean;
    v_enable_approval boolean;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Bypass if run by service role or migration
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get workspace ID for this report
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_report_workspace_id(NEW.id);
    ELSE
        -- For INSERT, we need to get it from the group_id
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;

    -- Check if approval is enabled for this workspace
    SELECT COALESCE(value = 'true', true) INTO v_enable_approval
    FROM workspace_configs
    WHERE ws_id = v_ws_id AND id = 'ENABLE_REPORT_APPROVAL';
    
    -- Check if user has approve and create permissions
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_reports');
    v_has_create_permission := has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_reports');
    
    -- If approval is disabled, auto-approve if user has create permission
    IF NOT v_enable_approval THEN
        IF v_has_create_permission THEN
            NEW.report_approval_status := 'APPROVED';
            NEW.approved_by := v_user_id;
            NEW.approved_at := now();
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
            RETURN NEW;
        END IF;
    END IF;

    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
        -- Auto-approve if user has both create and approve permissions and status is PENDING
        IF NEW.report_approval_status = 'PENDING' AND v_has_create_permission THEN
            NEW.report_approval_status := 'APPROVED';
        END IF;

        IF NEW.report_approval_status = 'REJECTED' THEN
            -- Validate rejection_reason is provided
            IF NEW.rejection_reason IS NULL OR NEW.rejection_reason = '' THEN
                RAISE EXCEPTION 'rejection_reason is required when rejecting a report';
            END IF;
            -- Allow rejection, ensure required fields are set
            IF NEW.rejected_by IS NULL THEN
                NEW.rejected_by := v_user_id;
            END IF;
            IF NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            END IF;
            -- Clear approval fields
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF NEW.report_approval_status = 'APPROVED' THEN
            -- Allow approval
            IF NEW.approved_by IS NULL THEN
                NEW.approved_by := v_user_id;
            END IF;
            IF NEW.approved_at IS NULL THEN
                NEW.approved_at := now();
            END IF;
            -- Clear rejection fields
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    ELSE
        -- User doesn't have approve permission
        -- If they're trying to set approval fields directly, reject
        IF TG_OP = 'UPDATE' AND (
            NEW.report_approval_status IS DISTINCT FROM OLD.report_approval_status OR
            NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
            NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
            NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR
            NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR
            NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        ) THEN
            RAISE EXCEPTION 'You do not have permission to modify approval fields';
        END IF;
        
        -- Force pending status and clear approval fields
        NEW.report_approval_status := 'PENDING';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejected_by := NULL;
        NEW.rejected_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 3. Update handle_post_approval to respect ENABLE_POST_APPROVAL
CREATE OR REPLACE FUNCTION public.handle_post_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id uuid;
    v_user_id uuid;
    v_has_approve_permission boolean;
    v_has_create_permission boolean;
    v_enable_approval boolean;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Bypass if run by service role or migration
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get workspace ID for this post
    IF TG_OP = 'UPDATE' THEN
        v_ws_id := get_post_workspace_id(NEW.id);
    ELSE
        -- For INSERT, we need to get it from the group_id
        SELECT ws_id INTO v_ws_id
        FROM workspace_user_groups
        WHERE id = NEW.group_id;
    END IF;

    -- Check if approval is enabled for this workspace
    SELECT COALESCE(value = 'true', true) INTO v_enable_approval
    FROM workspace_configs
    WHERE ws_id = v_ws_id AND id = 'ENABLE_POST_APPROVAL';
    
    -- Check if user has approve and create permissions
    v_has_approve_permission := has_workspace_permission(v_ws_id, v_user_id, 'approve_posts');
    v_has_create_permission := has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_posts');
    
    -- If approval is disabled, auto-approve if user has create permission
    IF NOT v_enable_approval THEN
        IF v_has_create_permission THEN
            NEW.post_approval_status := 'APPROVED';
            NEW.approved_by := v_user_id;
            NEW.approved_at := now();
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
            RETURN NEW;
        END IF;
    END IF;

    -- If user has approve permission, allow their chosen status (APPROVED or REJECTED)
    IF v_has_approve_permission THEN
        -- Auto-approve if user has both create and approve permissions and status is PENDING
        IF NEW.post_approval_status = 'PENDING' AND v_has_create_permission THEN
            NEW.post_approval_status := 'APPROVED';
        END IF;

        IF NEW.post_approval_status = 'REJECTED' THEN
            -- Validate rejection_reason is provided
            IF NEW.rejection_reason IS NULL OR NEW.rejection_reason = '' THEN
                RAISE EXCEPTION 'rejection_reason is required when rejecting a post';
            END IF;
            -- Allow rejection, ensure required fields are set
            IF NEW.rejected_by IS NULL THEN
                NEW.rejected_by := v_user_id;
            END IF;
            IF NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            END IF;
            -- Clear approval fields
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF NEW.post_approval_status = 'APPROVED' THEN
            -- Allow approval
            IF NEW.approved_by IS NULL THEN
                NEW.approved_by := v_user_id;
            END IF;
            IF NEW.approved_at IS NULL THEN
                NEW.approved_at := now();
            END IF;
            -- Clear rejection fields
            NEW.rejected_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    ELSE
        -- User doesn't have approve permission
        -- If they're trying to set approval fields directly, reject
        IF TG_OP = 'UPDATE' AND (
            NEW.post_approval_status IS DISTINCT FROM OLD.post_approval_status OR
            NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
            NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
            NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR
            NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR
            NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        ) THEN
            RAISE EXCEPTION 'You do not have permission to modify approval fields';
        END IF;
        
        -- Force pending status and clear approval fields
        NEW.post_approval_status := 'PENDING';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejected_by := NULL;
        NEW.rejected_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    
    RETURN NEW;
END;
$$;
