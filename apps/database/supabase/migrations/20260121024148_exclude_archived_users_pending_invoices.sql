-- Filter out archived users from pending invoices
-- Users with archived=true should not appear in get_pending_invoices results

DROP FUNCTION IF EXISTS get_pending_invoices_base(uuid, boolean) CASCADE;

CREATE OR REPLACE FUNCTION get_pending_invoices_base(
  p_ws_id uuid,
  p_use_attendance_based boolean DEFAULT TRUE
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  month text,
  sessions date[],
  attendance_days integer,
  billable_days integer
) AS $$
BEGIN
  PERFORM set_config('statement_timeout', '5s', true);
  -- Verify caller has access to the workspace
  IF NOT is_org_member(auth.uid(), p_ws_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to workspace %', p_ws_id;
  END IF;

  RETURN QUERY
  WITH user_groups AS (
    -- Get all active user groups with students (exclude archived users)
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
      AND wu.archived IS NOT TRUE  -- Filter out archived users

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
  session_counts_per_month AS (
    -- Count total sessions for each user-group-month combination
    SELECT
      pm.user_id,
      pm.group_id,
      pm.month,
      COUNT(session_date)::integer as total_sessions
    FROM pending_months pm
    CROSS JOIN LATERAL unnest(pm.sessions) as session_date
    WHERE to_char(session_date::date, 'YYYY-MM') = pm.month
    GROUP BY pm.user_id, pm.group_id, pm.month
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
      AND uga.status IN ('PRESENT', 'LATE')
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
    -- Always return actual attendance days for display
    COALESCE(ac.attendance_days, 0)::integer as attendance_days,
    -- Billable days: use attendance or sessions based on config
    CASE
      WHEN p_use_attendance_based THEN COALESCE(ac.attendance_days, 0)::integer
      ELSE COALESCE(sc.total_sessions, 0)::integer
    END as billable_days
  FROM pending_months pm
  LEFT JOIN attendance_counts ac 
    ON ac.user_id = pm.user_id 
    AND ac.group_id = pm.group_id 
    AND ac.month = pm.month
  LEFT JOIN session_counts_per_month sc
    ON sc.user_id = pm.user_id
    AND sc.group_id = pm.group_id
    AND sc.month = pm.month
  WHERE COALESCE(ac.attendance_days, 0) > 0;  -- Always require attendance records
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
