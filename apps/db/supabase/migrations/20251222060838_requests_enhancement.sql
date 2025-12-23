-- =============================================================================
-- Time Tracking Requests Enhancement Migration
-- Adds: NEEDS_INFO status, comments table, and updated RLS/triggers
-- =============================================================================
-- =============================================================================
-- 2. ADD NEW COLUMNS TO REQUESTS TABLE
-- =============================================================================
ALTER TABLE time_tracking_requests 
    ADD COLUMN needs_info_requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN needs_info_requested_at TIMESTAMPTZ,
    ADD COLUMN needs_info_reason TEXT;

-- =============================================================================
-- 3. CREATE COMMENTS TABLE
-- =============================================================================
CREATE TABLE time_tracking_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES time_tracking_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. UPDATE CHECK CONSTRAINTS
-- =============================================================================

-- Drop existing constraints that need to be updated
ALTER TABLE time_tracking_requests DROP CONSTRAINT IF EXISTS chk_pending_data;

-- Recreate pending constraint to include NEEDS_INFO fields
ALTER TABLE time_tracking_requests
ADD CONSTRAINT chk_pending_data
CHECK (
    (approval_status <> 'PENDING') OR 
    (approved_by IS NULL AND approved_at IS NULL 
     AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
     AND needs_info_requested_by IS NULL AND needs_info_requested_at IS NULL AND needs_info_reason IS NULL)
);

-- Add constraint for NEEDS_INFO status
ALTER TABLE time_tracking_requests
ADD CONSTRAINT chk_needs_info_data
CHECK (
    (approval_status <> 'NEEDS_INFO') OR 
    (needs_info_requested_by IS NOT NULL AND needs_info_requested_at IS NOT NULL AND needs_info_reason IS NOT NULL
     AND approved_by IS NULL AND approved_at IS NULL
     AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
);

-- =============================================================================
-- 5. UPDATE TRIGGER FUNCTION FOR REQUEST UPDATES
-- =============================================================================
CREATE OR REPLACE FUNCTION check_time_tracking_request_update()
RETURNS TRIGGER AS $$
BEGIN
    -- =========================================================================
    -- APPROVER PATH: User is NOT the owner
    -- =========================================================================
    IF NEW.user_id <> auth.uid() THEN
        -- Ensure content fields are not modified by approvers
        IF NEW.title <> OLD.title 
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.start_time <> OLD.start_time
            OR NEW.end_time <> OLD.end_time
            OR NEW.task_id IS DISTINCT FROM OLD.task_id
            OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.images IS DISTINCT FROM OLD.images THEN
            RAISE EXCEPTION 'Approvers cannot modify request content fields';
        END IF;
        
        -- Ensure ownership/creation fields are not modified
        IF NEW.user_id <> OLD.user_id 
            OR NEW.workspace_id <> OLD.workspace_id 
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Cannot modify ownership or creation fields';
        END IF;
        
        -- Validate status transitions for approvers
        IF NEW.approval_status = 'APPROVED' THEN
            -- Can only approve from PENDING
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
            -- Can only reject from PENDING
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
            -- Can only request info from PENDING
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
    -- OWNER PATH: User IS the owner
    -- =========================================================================
    IF NEW.user_id = auth.uid() THEN
        -- Owner can only change status from NEEDS_INFO to PENDING
        IF NEW.approval_status <> OLD.approval_status THEN
            IF NOT (OLD.approval_status = 'NEEDS_INFO' AND NEW.approval_status = 'PENDING') THEN
                RAISE EXCEPTION 'Request owner can only resubmit from NEEDS_INFO to PENDING status';
            END IF;
            -- When resubmitting, clear the needs_info fields
            IF NEW.needs_info_requested_by IS NOT NULL OR NEW.needs_info_requested_at IS NOT NULL OR NEW.needs_info_reason IS NOT NULL THEN
                RAISE EXCEPTION 'Must clear needs_info fields when resubmitting';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =============================================================================
-- 6. UPDATE RLS POLICIES FOR TIME_TRACKING_REQUESTS
-- =============================================================================

-- Drop existing update policies that need modification
DROP POLICY IF EXISTS "User can update their own PENDING request" ON "public"."time_tracking_requests";
DROP POLICY IF EXISTS "Approver can update status fields only" ON "public"."time_tracking_requests";

-- Drop and recreate the SELECT policy with permission-based access
DROP POLICY IF EXISTS "Enable read access for member of workspace" ON "public"."time_tracking_requests";

-- Managers can view ALL requests in the workspace, regular users can only view their own
CREATE POLICY "Enable read access for requests" 
ON "public"."time_tracking_requests" AS PERMISSIVE FOR SELECT TO authenticated 
USING (
    is_org_member(auth.uid(), workspace_id)
    AND (
        -- User can always see their own requests
        auth.uid() = user_id
        -- OR user has manage permission to see all requests
        OR has_workspace_permission(workspace_id, auth.uid(), 'manage_time_tracking_requests'::text)
    )
);

-- Owner can update their own PENDING or NEEDS_INFO requests
CREATE POLICY "User can update their own PENDING or NEEDS_INFO request" 
ON "public"."time_tracking_requests" AS PERMISSIVE FOR UPDATE TO authenticated 
USING (
    is_org_member(auth.uid(), workspace_id)
    AND auth.uid() = user_id
    AND (approval_status = 'PENDING' OR approval_status = 'NEEDS_INFO')
)
WITH CHECK (
    user_id = auth.uid()
    AND is_org_member(auth.uid(), workspace_id)
    AND (approval_status = 'PENDING' OR approval_status = 'NEEDS_INFO')
);

-- Approver can update status fields (PENDING -> APPROVED/REJECTED/NEEDS_INFO)
CREATE POLICY "Approver can update status fields only" 
ON "public"."time_tracking_requests" AS PERMISSIVE FOR UPDATE TO authenticated 
USING (
    is_org_member(auth.uid(), workspace_id)
    AND auth.uid() <> user_id 
    AND approval_status = 'PENDING'
    AND has_workspace_permission(workspace_id, auth.uid(), 'manage_time_tracking_requests'::text)
)
WITH CHECK (
    is_org_member(auth.uid(), workspace_id)
    AND (approval_status = 'APPROVED' OR approval_status = 'REJECTED' OR approval_status = 'NEEDS_INFO')
    AND has_workspace_permission(workspace_id, auth.uid(), 'manage_time_tracking_requests'::text)
);

-- =============================================================================
-- 7. RLS POLICIES FOR COMMENTS TABLE
-- =============================================================================
ALTER TABLE time_tracking_request_comments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can access request comments
CREATE OR REPLACE FUNCTION can_view_request_comments(p_request_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT user_id, workspace_id INTO v_request
    FROM time_tracking_requests
    WHERE id = p_request_id;
    
    IF v_request IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Owner can view their own request's comments
    IF v_request.user_id = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Users with manage_time_tracking_requests permission can view comments
    IF has_workspace_permission(v_request.workspace_id, p_user_id, 'manage_time_tracking_requests'::text) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read: Only request owner or users with manage permission
CREATE POLICY "Allow owners and managers to view comments"
ON time_tracking_request_comments FOR SELECT TO authenticated
USING (
    can_view_request_comments(request_id, auth.uid())
);

-- Insert: Only users who can view the request comments can add comments
CREATE POLICY "Allow owners and managers to add comments"
ON time_tracking_request_comments FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND can_view_request_comments(request_id, auth.uid())
);

-- Update: Only the comment author within 15 minutes
CREATE POLICY "Allow authors to update their own comments within 15 minutes"
ON time_tracking_request_comments FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
    AND created_at > (NOW() - INTERVAL '15 minutes')
)
WITH CHECK (
    user_id = auth.uid()
);

-- Delete: Only the comment author within 15 minutes
CREATE POLICY "Allow authors to delete their own comments within 15 minutes"
ON time_tracking_request_comments FOR DELETE TO authenticated
USING (
    user_id = auth.uid()
    AND created_at > (NOW() - INTERVAL '15 minutes')
);

-- Reuse or create the function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for comments table
CREATE TRIGGER update_time_tracking_request_comments_updated_at
    BEFORE UPDATE ON time_tracking_request_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_time_tracking_request_comments_request_id 
    ON time_tracking_request_comments(request_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_request_comments_user_id 
    ON time_tracking_request_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_requests_needs_info 
    ON time_tracking_requests(workspace_id, user_id) 
    WHERE approval_status = 'NEEDS_INFO';
CREATE INDEX IF NOT EXISTS idx_time_tracking_request_comments_created_at 
    ON time_tracking_request_comments(created_at);

-- =============================================================================
-- 9. GRANT PERMISSIONS
-- =============================================================================
GRANT EXECUTE ON FUNCTION can_view_request_comments TO authenticated;