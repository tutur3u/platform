-- Create a helper function that returns base pending invoice data
-- This eliminates duplication between get_pending_invoices and get_pending_invoices_count
-- Returns user-group combinations with aggregated attendance data for unpaid periods

-- Drop the function first because we are changing the return type
DROP FUNCTION IF EXISTS get_pending_invoices_base(uuid) CASCADE;

CREATE OR REPLACE FUNCTION get_pending_invoices_base(p_ws_id uuid)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  month text,
  sessions date[],
  attendance_days integer
) AS $$
BEGIN
  PERFORM set_config('statement_timeout', '5s', true);  -- tune as needed
  -- Verify caller has access to the workspace
  IF NOT is_org_member(auth.uid(), p_ws_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to workspace %', p_ws_id;
  END IF;

  RETURN QUERY
  WITH user_groups AS (
    -- Get all active user groups with students
    SELECT DISTINCT
      wugu.user_id,
      wu.full_name as user_name,
      wu.avatar_url as user_avatar_url,
      wug.id as group_id,
      wug.name as group_name,
      wug.sessions,
      wug.starting_date,
      wug.ending_date
    FROM workspace_user_groups_users wugu
    JOIN workspace_users wu ON wu.id = wugu.user_id
    JOIN workspace_user_groups wug ON wug.id = wugu.group_id
    WHERE wug.ws_id = p_ws_id
      AND wugu.role = 'STUDENT'
      AND wu.ws_id = p_ws_id
  ),
  latest_invoices AS (
    -- Get the latest subscription invoice for each user-group combination
    SELECT DISTINCT ON (fi.customer_id, fi.user_group_id)
      fi.customer_id,
      fi.user_group_id,
      fi.valid_until
    FROM finance_invoices fi
    WHERE fi.ws_id = p_ws_id
      AND fi.user_group_id IS NOT NULL
      AND fi.valid_until IS NOT NULL
    ORDER BY fi.customer_id, fi.user_group_id, fi.created_at DESC
  ),
  pending_months AS (
    -- Generate months between valid_until and now that need invoices
    -- If valid_until is 2025-11-01, we start looking from 2025-11-01 onwards
    -- This means the October invoice (valid until Nov 1) is considered paid for October
    SELECT
      ug.user_id,
      ug.user_name,
      ug.user_avatar_url,
      ug.group_id,
      ug.group_name,
      ug.sessions,
      to_char(month_date, 'YYYY-MM') as month,
      month_date
    FROM user_groups ug
    LEFT JOIN latest_invoices li ON li.customer_id = ug.user_id AND li.user_group_id = ug.group_id
    CROSS JOIN LATERAL generate_series(
      COALESCE(
        -- Start from valid_until date (which is first day of next unpaid month)
        date_trunc('month', li.valid_until),
        date_trunc('month', COALESCE(ug.starting_date, CURRENT_DATE))
      ),
      date_trunc('month', LEAST(COALESCE(ug.ending_date, CURRENT_DATE), CURRENT_DATE)),
      '1 month'::interval
    ) as month_date
    WHERE month_date <= date_trunc('month', CURRENT_DATE)
      -- Include months from valid_until onwards (valid_until marks the START of unpaid period)
      AND (li.valid_until IS NULL OR month_date >= date_trunc('month', li.valid_until))
  ),
  attendance_counts AS (
    -- Count attendance for each user-group-month combination
    SELECT
      pm.user_id,
      pm.group_id,
      pm.month,
      COUNT(uga.date)::integer as attendance_days
    FROM pending_months pm
    LEFT JOIN user_group_attendance uga 
      ON uga.user_id = pm.user_id 
      AND uga.group_id = pm.group_id
      AND to_char(uga.date, 'YYYY-MM') = pm.month
    GROUP BY pm.user_id, pm.group_id, pm.month
  )
  SELECT
    pm.user_id,
    pm.user_name,
    pm.user_avatar_url,
    pm.group_id,
    pm.group_name,
    pm.month,
    pm.sessions,
    COALESCE(ac.attendance_days, 0)::integer as attendance_days
  FROM pending_months pm
  LEFT JOIN attendance_counts ac 
    ON ac.user_id = pm.user_id 
    AND ac.group_id = pm.group_id 
    AND ac.month = pm.month
  WHERE COALESCE(ac.attendance_days, 0) > 0;  -- Only include months with attendance
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create a count function for pending invoices pagination
CREATE OR REPLACE FUNCTION get_pending_invoices_count(p_ws_id uuid)
RETURNS bigint AS $$
DECLARE
  result_count bigint;
BEGIN
  WITH base_data AS (
    SELECT * FROM get_pending_invoices_base(p_ws_id)
  ),
  combined_pending AS (
    -- Combine all pending months per user-group with aggregated attendance
    SELECT
      bd.user_id,
      bd.user_name,
      bd.group_id,
      bd.group_name,
      SUM(bd.attendance_days)::integer as total_attendance_days
    FROM base_data bd
    GROUP BY bd.user_id, bd.user_name, bd.group_id, bd.group_name
  )
  SELECT COUNT(*)
  INTO result_count
  FROM combined_pending
  WHERE total_attendance_days > 0;
  
  RETURN result_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Create function to get pending invoices for a workspace
-- This function calculates invoices that haven't been created yet based on:
-- 1. The valid_until date from the user's latest subscription invoice
-- 2. User attendance aggregated across all unpaid months
-- 3. Product pricing from user group linked products
-- Note: Combines all unpaid months per user-group and calculates total: attendance * price
CREATE OR REPLACE FUNCTION get_pending_invoices(
  p_ws_id uuid,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
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
  session_counts AS (
    -- Count total sessions for each group-month
    SELECT
      bd.group_id,
      bd.month,
      COUNT(session_date)::integer as total_sessions
    FROM base_data bd
    CROSS JOIN LATERAL unnest(bd.sessions) as session_date
    WHERE to_char(session_date::date, 'YYYY-MM') = bd.month
    GROUP BY bd.group_id, bd.month
  ),
  ranked_inventory AS (
    -- Rank inventory products by matching priority for each group linked product
    -- Priority: 1) exact unit+warehouse match, 2) unit-only match (prefer in-stock), 3) any product (prefer in-stock)
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
      bd.user_id,
      bd.user_name,
      bd.user_avatar_url,
      bd.group_id,
      bd.group_name,
      string_agg(bd.month, ', ' ORDER BY bd.month) as months_owed,
      SUM(bd.attendance_days)::integer as total_attendance_days,
      SUM(COALESCE(sc.total_sessions, 0))::integer as total_sessions
    FROM base_data bd
    LEFT JOIN session_counts sc
      ON sc.group_id = bd.group_id
      AND sc.month = bd.month
    GROUP BY bd.user_id, bd.user_name, bd.user_avatar_url, bd.group_id, bd.group_name
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
    -- For unlimited stock products: use full attendance_days
    -- For limited stock products: cap at available stock amount
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
