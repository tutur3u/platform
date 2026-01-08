-- Migration: Add RPC functions for leave management
-- Purpose: Replace complex Supabase queries with database RPC functions to avoid TypeScript deep instantiation errors
-- Created: 2026-01-08

-- ============================================================================
-- Function 1: Get leave balance with details (leave_type, workspace_user, user)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_leave_balance_with_details(
    p_balance_id UUID,
    p_ws_id UUID,
    p_user_id UUID DEFAULT auth.uid()
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

    -- Get leave balance with joined data
    SELECT jsonb_build_object(
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
    INTO v_result
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    JOIN workspace_users wu ON lb.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lb.id = p_balance_id
        AND lb.ws_id = p_ws_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Leave balance not found';
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 2: Update leave balance with details
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_leave_balance_with_details(
    p_balance_id UUID,
    p_ws_id UUID,
    p_updates JSONB,
    p_user_id UUID DEFAULT auth.uid()
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
    -- Check if user has permission to manage leave balances
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    -- Update leave balance
    UPDATE leave_balances
    SET
        accrued_days = COALESCE((p_updates->>'accrued_days')::NUMERIC, accrued_days),
        used_days = COALESCE((p_updates->>'used_days')::NUMERIC, used_days),
        adjusted_days = COALESCE((p_updates->>'adjusted_days')::NUMERIC, adjusted_days),
        carried_over_days = COALESCE((p_updates->>'carried_over_days')::NUMERIC, carried_over_days),
        notes = CASE 
            WHEN p_updates ? 'notes' THEN (p_updates->>'notes')::TEXT
            ELSE notes
        END,
        updated_at = NOW()
    WHERE id = p_balance_id
        AND ws_id = p_ws_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance not found';
    END IF;

    -- Return updated balance with details using the get function
    SELECT public.get_leave_balance_with_details(p_balance_id, p_ws_id, p_user_id)
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 3: Get leave calendar events with filters
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_leave_calendar_events(
    p_ws_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_user_id UUID DEFAULT auth.uid(),
    p_filter_user_id UUID DEFAULT NULL,
    p_statuses TEXT[] DEFAULT NULL,
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
    v_status_filter TEXT[];
BEGIN
    -- Check if user has permission to view leave requests
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

    -- Set default statuses if not provided
    IF p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL THEN
        v_status_filter := ARRAY['approved', 'pending']::TEXT[];
    ELSE
        v_status_filter := p_statuses;
    END IF;

    -- Build query result
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lr.id,
                'user_id', lr.user_id,
                'leave_type_id', lr.leave_type_id,
                'start_date', lr.start_date,
                'end_date', lr.end_date,
                'is_half_day_start', lr.is_half_day_start,
                'is_half_day_end', lr.is_half_day_end,
                'duration_days', lr.duration_days,
                'status', lr.status,
                'leave_type', jsonb_build_object(
                    'id', lt.id,
                    'name', lt.name,
                    'code', lt.code,
                    'color', lt.color,
                    'icon', lt.icon
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
    INTO v_result
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN workspace_users wu ON lr.user_id = wu.id
    JOIN users u ON wu.user_id = u.id
    WHERE lr.ws_id = p_ws_id
        -- Date range filter: check for any overlap
        AND lr.start_date <= p_end_date
        AND lr.end_date >= p_start_date
        -- User filter: if not manager, only show own requests; if manager, apply filter_user_id if provided
        AND (
            (NOT p_can_manage_workforce AND lr.user_id = v_current_workspace_user_id)
            OR (p_can_manage_workforce AND (p_filter_user_id IS NULL OR lr.user_id = p_filter_user_id))
        )
        -- Status filter
        AND lr.status = ANY(v_status_filter)
    ORDER BY lr.start_date ASC;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Function 4: Cancel leave request with details
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_leave_request_with_details(
    p_request_id UUID,
    p_ws_id UUID,
    p_user_id UUID DEFAULT auth.uid(),
    p_cancellation_reason TEXT DEFAULT NULL
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
    v_request_user_id UUID;
    v_request_status leave_request_status;
BEGIN
    -- Check if user has any permission
    v_has_permission := public.has_workspace_permission(p_ws_id, p_user_id, 'view_workforce')
        OR public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');
    
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Access denied: insufficient permissions';
    END IF;

    -- Check if user can manage workforce
    v_can_manage_workforce := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_workforce');

    -- Get current user's workspace_user ID
    SELECT id INTO v_current_workspace_user_id
    FROM workspace_users
    WHERE ws_id = p_ws_id
        AND user_id = p_user_id;
    
    IF v_current_workspace_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found in workspace';
    END IF;

    -- Get request details
    SELECT user_id, status
    INTO v_request_user_id, v_request_status
    FROM leave_requests
    WHERE id = p_request_id
        AND ws_id = p_ws_id;

    IF v_request_user_id IS NULL THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;

    -- Check if user can cancel this request (must be owner or manager)
    IF NOT v_can_manage_workforce AND v_request_user_id != v_current_workspace_user_id THEN
        RAISE EXCEPTION 'You can only cancel your own leave requests';
    END IF;

    -- Check if request can be cancelled
    IF v_request_status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Cannot cancel a request with status: %', v_request_status;
    END IF;

    -- Update the request
    UPDATE leave_requests
    SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = p_cancellation_reason,
        updated_at = NOW()
    WHERE id = p_request_id
        AND ws_id = p_ws_id;

    -- Return cancelled request with details
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
        'cancelled_at', lr.cancelled_at,
        'cancellation_reason', lr.cancellation_reason,
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
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_leave_balance_with_details(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_leave_balance_with_details(UUID, UUID, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_calendar_events(UUID, DATE, DATE, UUID, UUID, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request_with_details(UUID, UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON FUNCTION public.get_leave_balance_with_details IS
'Returns a leave balance with joined leave_type and workspace_user/user details. Requires view_workforce or manage_workforce permission.';

COMMENT ON FUNCTION public.update_leave_balance_with_details IS
'Updates a leave balance and returns the updated record with joined details. Requires manage_workforce permission.';

COMMENT ON FUNCTION public.get_leave_calendar_events IS
'Returns filtered leave requests for calendar view with date range, user, and status filters. Handles permission-based filtering automatically.';

COMMENT ON FUNCTION public.cancel_leave_request_with_details IS
'Cancels a leave request and returns the cancelled request with joined details. Validates ownership and status before cancelling.';
