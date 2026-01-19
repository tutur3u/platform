-- Update get_pending_invoices_count to support filtering
DROP FUNCTION IF EXISTS get_pending_invoices_count(uuid);
CREATE OR REPLACE FUNCTION get_pending_invoices_count(
  p_ws_id uuid,
  p_query text DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  result_count bigint;
BEGIN
  WITH base_data AS (
    SELECT * FROM get_pending_invoices_base(p_ws_id)
  ),
  filtered_base AS (
    SELECT * FROM base_data bd
    WHERE (p_user_ids IS NULL OR bd.user_id = ANY(p_user_ids))
      AND (p_query IS NULL OR (
        bd.user_name ILIKE '%' || p_query || '%' OR 
        bd.group_name ILIKE '%' || p_query || '%'
      ))
  ),
  combined_pending AS (
    -- Combine all pending months per user-group with aggregated attendance
    SELECT
      fb.user_id,
      fb.group_id,
      SUM(fb.attendance_days)::integer as total_attendance_days
    FROM filtered_base fb
    GROUP BY fb.user_id, fb.group_id
  )
  SELECT COUNT(*)
  INTO result_count
  FROM combined_pending
  WHERE total_attendance_days > 0;
  
  RETURN result_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Update get_pending_invoices to support filtering
DROP FUNCTION IF EXISTS get_pending_invoices(uuid, integer, integer);
CREATE OR REPLACE FUNCTION get_pending_invoices(
  p_ws_id uuid,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_query text DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  months_owed text,
  attendance_days integer,
  total_sessions integer,
  potential_total numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH base_data AS (
    SELECT * FROM get_pending_invoices_base(p_ws_id)
  ),
  filtered_base AS (
    SELECT * FROM base_data bd
    WHERE (p_user_ids IS NULL OR bd.user_id = ANY(p_user_ids))
      AND (p_query IS NULL OR (
        bd.user_name ILIKE '%' || p_query || '%' OR 
        bd.group_name ILIKE '%' || p_query || '%'
      ))
  ),
  session_counts AS (
    -- Count total sessions for each group-month
    SELECT
      fb.group_id,
      fb.month,
      COUNT(session_date)::integer as total_sessions
    FROM filtered_base fb
    CROSS JOIN LATERAL unnest(fb.sessions) as session_date
    WHERE to_char(session_date::date, 'YYYY-MM') = fb.month
    GROUP BY fb.group_id, fb.month
  ),
  ranked_inventory AS (
    -- Rank inventory products by matching priority for each group linked product
    SELECT
      uglp.group_id,
      uglp.product_id,
      uglp.unit_id,
      uglp.warehouse_id as desired_warehouse_id,
      ip.price,
      ip.amount as stock_amount,
      ROW_NUMBER() OVER (
        PARTITION BY uglp.group_id, uglp.product_id, uglp.unit_id, uglp.warehouse_id
        ORDER BY
          CASE
            -- Priority 1: Exact match (unit + warehouse)
            WHEN ip.unit_id = uglp.unit_id AND ip.warehouse_id = uglp.warehouse_id THEN 1
            -- Priority 2: Unit match only, prefer in-stock
            WHEN ip.unit_id = uglp.unit_id THEN 2
            -- Priority 3: Any product, prefer in-stock
            ELSE 3
          END,
          -- Within same priority, prefer items with stock
          CASE WHEN ip.amount IS NULL OR ip.amount > 0 THEN 0 ELSE 1 END,
          -- Tie-breaker: warehouse_id for consistent ordering
          ip.warehouse_id
      ) as rank
    FROM user_group_linked_products uglp
    LEFT JOIN inventory_products ip ON ip.product_id = uglp.product_id
  ),
  group_product_prices AS (
    -- Select the best inventory match per group linked product
    SELECT
      ri.group_id,
      ri.product_id,
      ri.unit_id,
      ri.desired_warehouse_id as warehouse_id,
      COALESCE(ri.price, 0) as price,
      ri.stock_amount
    FROM ranked_inventory ri
    WHERE ri.rank = 1
  ),
  combined_pending AS (
    -- Combine all pending months per user-group with aggregated attendance
    SELECT
      fb.user_id,
      fb.user_name,
      fb.user_avatar_url,
      fb.group_id,
      fb.group_name,
      string_agg(fb.month, ', ' ORDER BY fb.month) as months_owed,
      SUM(fb.attendance_days)::integer as total_attendance_days,
      SUM(COALESCE(sc.total_sessions, 0))::integer as total_sessions
    FROM filtered_base fb
    LEFT JOIN session_counts sc
      ON sc.group_id = fb.group_id
      AND sc.month = fb.month
    GROUP BY fb.user_id, fb.user_name, fb.user_avatar_url, fb.group_id, fb.group_name
  )
  SELECT
    cp.user_id::uuid,
    cp.user_name::text,
    cp.user_avatar_url::text,
    cp.group_id::uuid,
    cp.group_name::text,
    cp.months_owed::text,
    cp.total_attendance_days::integer as attendance_days,
    cp.total_sessions::integer as total_sessions,
    -- Calculate potential total by respecting stock limits for each product individually
    ROUND(
      COALESCE(
        (SELECT SUM(
          CASE 
            WHEN gpp.stock_amount IS NULL THEN cp.total_attendance_days * gpp.price
            ELSE LEAST(cp.total_attendance_days, gpp.stock_amount) * gpp.price
          END
        )
        FROM group_product_prices gpp
        WHERE gpp.group_id = cp.group_id),
        0
      )
    )::numeric as potential_total
  FROM combined_pending cp
  WHERE cp.total_attendance_days > 0  -- Only show users with attendance
  ORDER BY cp.user_name, cp.group_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
