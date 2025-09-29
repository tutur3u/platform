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
    COALESCE(pu.total_count, 0) as total_count
  FROM paginated_users pu;
END;
$$;