-- Migration: Add additional RPC functions for leave management (part 2)
-- Purpose: Fix remaining deep instantiation errors in leave API routes
-- Created: 2026-01-08

-- ============================================================================
-- Function 1: Get leave balances with filters
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_leave_balances_with_details(
    p_ws_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_filter_user_id UUID DEFAULT NULL,
    p_filter_leave_type_id UUID DEFAULT NULL,
    p_filter_year INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_has_permission BOOLEAN;
BEGIN
    -- Check if user has permission to view leave balances
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'view_workforce')
        OR public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    -- Build query result
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lb.id,
                'ws_id', lb.ws_id,
                'user_id', lb.user_id,
                'leave_type_id', lb.leave_type_id,
                'accrued_days', lb.accrued_days,
                'used_days', lb.used_days,
                'adjusted_days', lb.adjusted_days,
                'balance_year', lb.balance_year,
                'carried_over_days', lb.carried_over_days,
                'last_accrual_date', lb.last_accrual_date,
                'notes', lb.notes,
                'created_at', lb.created_at,
                'updated_at', lb.updated_at,
                'leave_type', jsonb_build_object(
                    'id', lt.id,
                    'ws_id', lt.ws_id,
                    'name', lt.name,
                    'code', lt.code,
                    'description', lt.description,
                    'color', lt.color,
                    'icon', lt.icon,
                    'is_paid', lt.is_paid,
                    'requires_approval', lt.requires_approval,
                    'allow_half_days', lt.allow_half_days,
                    'accrual_rate_days_per_month', lt.accrual_rate_days_per_month,
                    'max_balance_days', lt.max_balance_days,
                    'max_carryover_days', lt.max_carryover_days,
                    'is_tet_leave', lt.is_tet_leave,
                    'is_wedding_leave', lt.is_wedding_leave,
                    'is_funeral_leave', lt.is_funeral_leave,
                    'category', lt.category,
                    'is_active', lt.is_active,
                    'display_order', lt.display_order,
                    'created_at', lt.created_at,
                    'created_by', lt.created_by,
                    'updated_at', lt.updated_at
                ),
                'user', jsonb_build_object(
                    'id', wu.id,
                    'display_name', wu.display_name,
                    'user', jsonb_build_object(
                        'id', u.id,
                        'display_name', u.display_name,
                        'avatar_url', u.avatar_url
                    )
                )
            )
            ORDER BY lb.balance_year DESC, lb.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    JOIN workspace_users wu ON lb.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lb.ws_id = p_ws_id
        AND (p_filter_user_id IS NULL OR lb.user_id = p_filter_user_id)
        AND (p_filter_leave_type_id IS NULL OR lb.leave_type_id = p_filter_leave_type_id)
        AND (p_filter_year IS NULL OR lb.balance_year = p_filter_year);

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 2: Create leave balance and return with details
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_leave_balance_with_details(
    p_ws_id UUID,
    p_user_id UUID,
    p_leave_type_id UUID,
    p_balance_year INT,
    p_accrued_days NUMERIC DEFAULT 0,
    p_used_days NUMERIC DEFAULT 0,
    p_carried_over_days NUMERIC DEFAULT 0,
    p_adjusted_days NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_has_permission BOOLEAN;
    v_new_balance_id UUID;
BEGIN
    -- Check if user has permission to manage leave balances
    v_has_permission := public.has_workspace_permission(p_ws_id, p_created_by, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    -- Verify user belongs to workspace
    IF NOT EXISTS (
        SELECT 1 FROM workspace_users 
        WHERE id = p_user_id AND ws_id = p_ws_id
    ) THEN
        RAISE EXCEPTION 'User not found in this workspace';
    END IF;

    -- Verify leave type belongs to workspace
    IF NOT EXISTS (
        SELECT 1 FROM leave_types 
        WHERE id = p_leave_type_id AND ws_id = p_ws_id
    ) THEN
        RAISE EXCEPTION 'Leave type not found in this workspace';
    END IF;

    -- Check for existing balance
    IF EXISTS (
        SELECT 1 FROM leave_balances 
        WHERE user_id = p_user_id 
        AND leave_type_id = p_leave_type_id 
        AND balance_year = p_balance_year 
        AND ws_id = p_ws_id
    ) THEN
        RAISE EXCEPTION 'Leave balance already exists for this user, leave type, and year';
    END IF;

    -- Insert new balance
    INSERT INTO leave_balances (
        ws_id,
        user_id,
        leave_type_id,
        balance_year,
        accrued_days,
        used_days,
        carried_over_days,
        adjusted_days,
        notes
    ) VALUES (
        p_ws_id,
        p_user_id,
        p_leave_type_id,
        p_balance_year,
        p_accrued_days,
        p_used_days,
        p_carried_over_days,
        p_adjusted_days,
        p_notes
    )
    RETURNING id INTO v_new_balance_id;

    -- Return the created balance with details
    SELECT public.get_leave_balance_with_details(v_new_balance_id, p_ws_id, p_created_by)
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 3: Get leave requests with filters
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_leave_requests_with_details(
    p_ws_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_filter_user_id UUID DEFAULT NULL,
    p_filter_leave_type_id UUID DEFAULT NULL,
    p_filter_status TEXT DEFAULT NULL,
    p_filter_year INT DEFAULT NULL,
    p_can_manage_workforce BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_has_permission BOOLEAN;
    v_current_workspace_user_id UUID;
BEGIN
    -- Check if user has permission
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'view_workforce')
        OR public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    -- Get current user's workspace_user ID if not a manager
    IF NOT p_can_manage_workforce THEN
        SELECT id INTO v_current_workspace_user_id
        FROM workspace_users
        WHERE ws_id = p_ws_id
            AND user_id = p_user_id;
        
        IF v_current_workspace_user_id IS NULL THEN
            RAISE EXCEPTION 'User not found in workspace';
        END IF;
    END IF;

    -- Build query result
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lr.id,
                'ws_id', lr.ws_id,
                'user_id', lr.user_id,
                'leave_type_id', lr.leave_type_id,
                'start_date', lr.start_date,
                'end_date', lr.end_date,
                'duration_days', lr.duration_days,
                'is_half_day_start', lr.is_half_day_start,
                'is_half_day_end', lr.is_half_day_end,
                'reason', lr.reason,
                'status', lr.status,
                'approver_id', lr.approver_id,
                'reviewed_at', lr.reviewed_at,
                'reviewer_comments', lr.reviewer_comments,
                'attachment_urls', lr.attachment_urls,
                'created_at', lr.created_at,
                'updated_at', lr.updated_at,
                'leave_type', jsonb_build_object(
                    'id', lt.id,
                    'ws_id', lt.ws_id,
                    'name', lt.name,
                    'code', lt.code,
                    'description', lt.description,
                    'color', lt.color,
                    'icon', lt.icon,
                    'is_paid', lt.is_paid,
                    'requires_approval', lt.requires_approval,
                    'allow_half_days', lt.allow_half_days,
                    'accrual_rate_days_per_month', lt.accrual_rate_days_per_month,
                    'max_balance_days', lt.max_balance_days,
                    'max_carryover_days', lt.max_carryover_days,
                    'is_tet_leave', lt.is_tet_leave,
                    'is_wedding_leave', lt.is_wedding_leave,
                    'is_funeral_leave', lt.is_funeral_leave,
                    'category', lt.category,
                    'is_active', lt.is_active,
                    'display_order', lt.display_order,
                    'created_at', lt.created_at,
                    'created_by', lt.created_by,
                    'updated_at', lt.updated_at
                ),
                'user', jsonb_build_object(
                    'id', wu.id,
                    'display_name', wu.display_name,
                    'user', jsonb_build_object(
                        'id', u.id,
                        'display_name', u.display_name,
                        'avatar_url', u.avatar_url
                    )
                ),
                'approver', CASE 
                    WHEN lr.approver_id IS NOT NULL THEN
                        jsonb_build_object(
                            'id', approver.id,
                            'display_name', approver.display_name,
                            'avatar_url', approver.avatar_url
                        )
                    ELSE NULL
                END
            )
            ORDER BY lr.start_date DESC
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN workspace_users wu ON lr.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    LEFT JOIN users approver ON lr.approver_id = approver.id
    WHERE lr.ws_id = p_ws_id
        -- User filter: if not manager, only show own requests
        AND (
            p_can_manage_workforce 
            OR lr.user_id = v_current_workspace_user_id
        )
        AND (p_filter_user_id IS NULL OR lr.user_id = p_filter_user_id)
        AND (p_filter_leave_type_id IS NULL OR lr.leave_type_id = p_filter_leave_type_id)
        AND (p_filter_status IS NULL OR lr.status::TEXT = p_filter_status)
        AND (p_filter_year IS NULL OR (lr.start_date >= make_date(p_filter_year, 1, 1) AND lr.end_date <= make_date(p_filter_year, 12, 31)));

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 4: Create leave request with details
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_leave_request_with_details(
    p_ws_id UUID,
    p_user_id UUID,
    p_leave_type_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_reason TEXT,
    p_is_half_day_start BOOLEAN DEFAULT FALSE,
    p_is_half_day_end BOOLEAN DEFAULT FALSE,
    p_notes TEXT DEFAULT NULL,
    p_emergency_contact TEXT DEFAULT NULL,
    p_submitted_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_has_permission BOOLEAN;
    v_can_manage_workforce BOOLEAN;
    v_current_workspace_user_id UUID;
    v_leave_type RECORD;
    v_duration NUMERIC;
    v_initial_status TEXT;
    v_new_request_id UUID;
BEGIN
    -- Check if user has any permission
    v_has_permission := public.has_workspace_permission(p_ws_id, p_submitted_by, 'view_workforce')
        OR public.has_workspace_permission(p_ws_id, p_submitted_by, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    v_can_manage_workforce := public.has_workspace_permission(p_ws_id, p_submitted_by, 'manage_workforce');

    -- Verify target user belongs to workspace
    IF NOT EXISTS (
        SELECT 1 FROM workspace_users 
        WHERE id = p_user_id AND ws_id = p_ws_id
    ) THEN
        RAISE EXCEPTION 'User not found in this workspace';
    END IF;

    -- Get current user's workspace_user ID
    SELECT id INTO v_current_workspace_user_id
    FROM workspace_users
    WHERE ws_id = p_ws_id AND user_id = p_submitted_by;

    -- Check if user can create request for this target user
    IF NOT v_can_manage_workforce AND v_current_workspace_user_id != p_user_id THEN
        RAISE EXCEPTION 'You can only create leave requests for yourself';
    END IF;

    -- Verify leave type belongs to workspace and is active
    SELECT id, is_active, requires_approval 
    INTO v_leave_type
    FROM leave_types
    WHERE id = p_leave_type_id AND ws_id = p_ws_id;

    IF v_leave_type.id IS NULL THEN
        RAISE EXCEPTION 'Leave type not found in this workspace';
    END IF;

    IF NOT v_leave_type.is_active THEN
        RAISE EXCEPTION 'This leave type is no longer active';
    END IF;

    -- Validate date range
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'Start date must be before or equal to end date';
    END IF;

    -- Calculate duration
    SELECT calculate_leave_duration(
        p_start_date,
        p_end_date,
        p_ws_id,
        p_is_half_day_start,
        p_is_half_day_end
    ) INTO v_duration;

    IF v_duration <= 0 THEN
        RAISE EXCEPTION 'Leave duration must be greater than 0';
    END IF;

    -- Determine initial status
    v_initial_status := CASE WHEN v_leave_type.requires_approval THEN 'pending' ELSE 'approved' END;

    -- Insert new request
    INSERT INTO leave_requests (
        ws_id,
        user_id,
        leave_type_id,
        start_date,
        end_date,
        is_half_day_start,
        is_half_day_end,
        duration_days,
        reason,
        status
    ) VALUES (
        p_ws_id,
        p_user_id,
        p_leave_type_id,
        p_start_date,
        p_end_date,
        p_is_half_day_start,
        p_is_half_day_end,
        v_duration,
        p_reason,
        v_initial_status::leave_request_status
    )
    RETURNING id INTO v_new_request_id;

    -- Return the created request with details
    SELECT jsonb_build_object(
        'id', lr.id,
        'ws_id', lr.ws_id,
        'user_id', lr.user_id,
        'leave_type_id', lr.leave_type_id,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'duration_days', lr.duration_days,
        'is_half_day_start', lr.is_half_day_start,
        'is_half_day_end', lr.is_half_day_end,
        'reason', lr.reason,
        'status', lr.status,
        'created_at', lr.created_at,
        'updated_at', lr.updated_at,
        'leave_type', jsonb_build_object(
            'id', lt.id,
            'ws_id', lt.ws_id,
            'name', lt.name,
            'code', lt.code,
            'description', lt.description,
            'color', lt.color,
            'icon', lt.icon,
            'is_paid', lt.is_paid,
            'requires_approval', lt.requires_approval,
            'allow_half_days', lt.allow_half_days,
            'category', lt.category,
            'is_active', lt.is_active
        ),
        'user', jsonb_build_object(
            'id', wu.id,
            'display_name', wu.display_name,
            'user', jsonb_build_object(
                'id', u.id,
                'display_name', u.display_name,
                'avatar_url', u.avatar_url
            )
        )
    )
    INTO v_result
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN workspace_users wu ON lr.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lr.id = v_new_request_id;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 5: Approve/reject leave request with details
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_leave_request_with_details(
    p_request_id UUID,
    p_ws_id UUID,
    p_action TEXT,
    p_user_id UUID DEFAULT auth.uid(),
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_has_permission BOOLEAN;
    v_request_status TEXT;
    v_new_status TEXT;
BEGIN
    -- Check if user has permission to manage workforce
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Only managers can approve or reject leave requests';
    END IF;

    -- Validate action
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid action. Must be "approve" or "reject"';
    END IF;

    -- Get request status
    SELECT status::TEXT INTO v_request_status
    FROM leave_requests
    WHERE id = p_request_id AND ws_id = p_ws_id;

    IF v_request_status IS NULL THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;

    -- Check if request is pending
    IF v_request_status != 'pending' THEN
        RAISE EXCEPTION 'Cannot % a request with status: %', p_action, v_request_status;
    END IF;

    -- Validate rejection reason if rejecting
    IF p_action = 'reject' AND (p_rejection_reason IS NULL OR p_rejection_reason = '') THEN
        RAISE EXCEPTION 'Rejection reason is required when rejecting a request';
    END IF;

    -- Determine new status
    v_new_status := CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END;

    -- Update the request
    UPDATE leave_requests
    SET
        status = v_new_status::leave_request_status,
        approver_id = p_user_id,
        reviewed_at = NOW(),
        reviewer_comments = CASE WHEN p_action = 'reject' THEN p_rejection_reason ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_request_id
        AND ws_id = p_ws_id;

    -- Return updated request with details
    SELECT jsonb_build_object(
        'id', lr.id,
        'ws_id', lr.ws_id,
        'user_id', lr.user_id,
        'leave_type_id', lr.leave_type_id,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'duration_days', lr.duration_days,
        'is_half_day_start', lr.is_half_day_start,
        'is_half_day_end', lr.is_half_day_end,
        'reason', lr.reason,
        'status', lr.status,
        'approver_id', lr.approver_id,
        'reviewed_at', lr.reviewed_at,
        'reviewer_comments', lr.reviewer_comments,
        'created_at', lr.created_at,
        'updated_at', lr.updated_at,
        'leave_type', jsonb_build_object(
            'id', lt.id,
            'ws_id', lt.ws_id,
            'name', lt.name,
            'code', lt.code,
            'description', lt.description,
            'color', lt.color,
            'icon', lt.icon,
            'is_paid', lt.is_paid,
            'requires_approval', lt.requires_approval,
            'allow_half_days', lt.allow_half_days,
            'category', lt.category,
            'is_active', lt.is_active
        ),
        'user', jsonb_build_object(
            'id', wu.id,
            'display_name', wu.display_name,
            'user', jsonb_build_object(
                'id', u.id,
                'display_name', u.display_name,
                'avatar_url', u.avatar_url
            )
        ),
        'approver', CASE 
            WHEN lr.approver_id IS NOT NULL THEN
                jsonb_build_object(
                    'id', approver.id,
                    'display_name', approver.display_name,
                    'avatar_url', approver.avatar_url
                )
            ELSE NULL
        END
    )
    INTO v_result
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN workspace_users wu ON lr.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    LEFT JOIN users approver ON lr.approver_id = approver.id
    WHERE lr.id = p_request_id
        AND lr.ws_id = p_ws_id;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 6: Get leave report data
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_leave_report_data(
    p_ws_id UUID,
    p_year INT,
    p_user_id UUID DEFAULT auth.uid(),
    p_filter_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_permission BOOLEAN;
    v_requests JSONB;
    v_balances JSONB;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Check if user has permission to view reports
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Only managers can view leave reports';
    END IF;

    v_start_date := make_date(p_year, 1, 1);
    v_end_date := make_date(p_year, 12, 31);

    -- Get requests for the year
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lr.id,
                'user_id', lr.user_id,
                'leave_type_id', lr.leave_type_id,
                'start_date', lr.start_date,
                'end_date', lr.end_date,
                'duration_days', lr.duration_days,
                'status', lr.status,
                'leave_type', jsonb_build_object(
                    'id', lt.id,
                    'name', lt.name,
                    'code', lt.code,
                    'category', lt.category
                ),
                'user', jsonb_build_object(
                    'id', wu.id,
                    'display_name', wu.display_name,
                    'user', jsonb_build_object(
                        'id', u.id,
                        'display_name', u.display_name,
                        'avatar_url', u.avatar_url
                    )
                )
            )
        ),
        '[]'::jsonb
    )
    INTO v_requests
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN workspace_users wu ON lr.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lr.ws_id = p_ws_id
        AND lr.start_date >= v_start_date
        AND lr.end_date <= v_end_date
        AND (p_filter_user_id IS NULL OR lr.user_id = p_filter_user_id);

    -- Get balances for the year
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lb.id,
                'user_id', lb.user_id,
                'leave_type_id', lb.leave_type_id,
                'accrued_days', lb.accrued_days,
                'used_days', lb.used_days,
                'adjusted_days', lb.adjusted_days,
                'balance_year', lb.balance_year,
                'leave_type', jsonb_build_object(
                    'id', lt.id,
                    'name', lt.name,
                    'code', lt.code,
                    'category', lt.category
                ),
                'user', jsonb_build_object(
                    'id', wu.id,
                    'display_name', wu.display_name,
                    'user', jsonb_build_object(
                        'id', u.id,
                        'display_name', u.display_name,
                        'avatar_url', u.avatar_url
                    )
                )
            )
        ),
        '[]'::jsonb
    )
    INTO v_balances
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    JOIN workspace_users wu ON lb.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lb.ws_id = p_ws_id
        AND lb.balance_year = p_year
        AND (p_filter_user_id IS NULL OR lb.user_id = p_filter_user_id);

    RETURN jsonb_build_object(
        'requests', v_requests,
        'balances', v_balances
    );
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_leave_balances_with_details(UUID, UUID, UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_leave_balance_with_details(UUID, UUID, UUID, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_requests_with_details(UUID, UUID, UUID, UUID, TEXT, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_leave_request_with_details(UUID, UUID, UUID, DATE, DATE, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_leave_request_with_details(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_report_data(UUID, INT, UUID, UUID) TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON FUNCTION public.get_leave_balances_with_details IS
'Returns leave balances with joined leave_type and workspace_user/user details, with optional filters.';

COMMENT ON FUNCTION public.create_leave_balance_with_details IS
'Creates a leave balance and returns the created record with joined details.';

COMMENT ON FUNCTION public.get_leave_requests_with_details IS
'Returns leave requests with joined details and optional filters. Handles permission-based filtering automatically.';

COMMENT ON FUNCTION public.create_leave_request_with_details IS
'Creates a leave request and returns the created record with joined details. Validates permissions, dates, and calculates duration.';

COMMENT ON FUNCTION public.approve_leave_request_with_details IS
'Approves or rejects a leave request and returns the updated record with joined details.';

COMMENT ON FUNCTION public.get_leave_report_data IS
'Returns leave requests and balances data for generating reports. Requires manage_workforce permission.';
