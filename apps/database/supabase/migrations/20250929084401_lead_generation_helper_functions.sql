-- Optimized PostgreSQL function to get guest user leads
-- This consolidates the N+1 query pattern into a single database call
CREATE OR REPLACE FUNCTION get_guest_user_leads(
  p_ws_id uuid,
  p_threshold integer DEFAULT 1,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  gender text,
  attendance_count bigint,
  group_id uuid,
  group_name text,
  has_lead_generation boolean,
  created_at timestamptz,
  total_count bigint
) 
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  offset_count integer;
BEGIN

  -- Validate input parameters
  IF p_page < 1 THEN
    RAISE EXCEPTION 'Page number must be >= 1, got %', p_page;
  END IF;
  IF p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 1000, got %', p_page_size;
  END IF;
  IF p_threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be >= 0, got %', p_threshold;
  END IF;
  -- Calculate offset for pagination
  offset_count := (p_page - 1) * p_page_size;
  
  -- Return optimized query with single database call
  RETURN QUERY
  WITH eligible_users AS (
    SELECT DISTINCT
      wu.id,
      wu.full_name,
      wu.email,
      wu.phone,
      wu.gender,
      wu.created_at,
      wug.id as group_id,
      wug.name as group_name,
      -- Get attendance count efficiently
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM user_group_attendance uga
        WHERE uga.user_id = wu.id
        AND uga.status IN ('PRESENT', 'LATE')
      ), 0) as attendance_count,
      -- Check if lead generation already exists
      EXISTS (
        SELECT 1 
        FROM guest_users_lead_generation gugl 
        WHERE gugl.user_id = wu.id 
        AND gugl.ws_id = p_ws_id
      ) as has_lead_generation
    FROM workspace_users wu
    INNER JOIN workspace_user_groups_users wugu ON wu.id = wugu.user_id
    INNER JOIN workspace_user_groups wug ON wugu.group_id = wug.id
    WHERE wu.ws_id = p_ws_id
    AND wu.archived = false
    AND wug.is_guest = true
    -- Apply search filter if provided
    AND (p_search IS NULL OR 
         wu.full_name ILIKE '%' || p_search || '%' OR 
         wu.email ILIKE '%' || p_search || '%')
    -- Check if user is actually a guest using the existing RPC
    AND is_user_guest(wu.id) = true
  ),
  filtered_users AS (
    SELECT *
    FROM eligible_users eu
    WHERE eu.attendance_count >= p_threshold
    AND eu.has_lead_generation = false
  ),
  paginated_users AS (
    SELECT *,
           COUNT(*) OVER () as total_count
    FROM filtered_users
    ORDER BY created_at DESC
    LIMIT p_page_size
    OFFSET offset_count
  )
  SELECT 
    pu.id,
    pu.full_name,
    pu.email,
    pu.phone,
    pu.gender,
    pu.attendance_count,
    pu.group_id,
    pu.group_name,
    pu.has_lead_generation,
    pu.created_at,
    pu.total_count
  FROM paginated_users pu;
END;
$$;


-- RPC function to check if a guest user is eligible for lead generation email
-- This can be called from the client to validate before attempting to send

CREATE OR REPLACE FUNCTION public.check_guest_lead_eligibility(
  p_ws_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  is_guest_user BOOLEAN;
  attendance_threshold SMALLINT;
  attendance_count INTEGER;
BEGIN

  -- Check 0: Verify the user belongs to the workspace
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = p_user_id AND ws_id = p_ws_id) THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'User does not belong to the specified workspace',
      'details', jsonb_build_object()
    );
  END IF;
  -- Check 1: Verify the user is a guest
  SELECT public.is_user_guest(p_user_id) INTO is_guest_user;

  IF NOT is_guest_user THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'User is not a guest user',
      'details', jsonb_build_object(
        'is_guest', false
      )
    );
  END IF;

  -- Check 2: Verify attendance threshold is configured
  SELECT ws.guest_user_checkup_threshold
  INTO attendance_threshold
  FROM public.workspace_settings ws
  WHERE ws.ws_id = p_ws_id;

  IF attendance_threshold IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Attendance threshold not configured for workspace',
      'details', jsonb_build_object(
        'is_guest', true,
        'threshold_configured', false
      )
    );
  END IF;

  -- Check 3: Calculate attendance count
  SELECT COUNT(*)
  INTO attendance_count
  FROM public.user_group_attendance
  WHERE user_id = p_user_id AND status IN ('PRESENT', 'LATE');

  -- Check 4: Verify attendance meets minimum threshold
  IF attendance_count < attendance_threshold THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', format('User attendance count (%s) does not meet minimum threshold (%s)', attendance_count, attendance_threshold),
      'details', jsonb_build_object(
        'is_guest', true,
        'threshold_configured', true,
        'attendance_count', attendance_count,
        'required_threshold', attendance_threshold,
        'meets_threshold', false
      )
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'eligible', true,
    'reason', 'User meets all eligibility criteria',
    'details', jsonb_build_object(
      'is_guest', true,
      'threshold_configured', true,
      'attendance_count', attendance_count,
      'required_threshold', attendance_threshold,
      'meets_threshold', true
    )
  );
END;
$function$;
