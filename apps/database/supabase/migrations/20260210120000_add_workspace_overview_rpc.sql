-- Paginated workspace overview with aggregated counts for the infrastructure dashboard
CREATE OR REPLACE FUNCTION get_workspace_overview(
  p_search text DEFAULT NULL,
  p_tier text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_workspace_type text DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_order text DEFAULT 'desc',
  p_page_size int DEFAULT 10,
  p_page int DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  name text,
  handle text,
  avatar_url text,
  personal boolean,
  creator_id uuid,
  creator_name text,
  creator_email text,
  created_at timestamptz,
  member_count bigint,
  role_count bigint,
  secret_count bigint,
  active_subscription_count bigint,
  highest_tier text,
  subscription_statuses text[],
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset int := (GREATEST(p_page, 1) - 1) * p_page_size;
BEGIN
  RETURN QUERY
  WITH member_counts AS (
    SELECT wm.ws_id, COUNT(*) AS cnt
    FROM workspace_members wm
    GROUP BY wm.ws_id
  ),
  role_counts AS (
    SELECT wr.ws_id, COUNT(*) AS cnt
    FROM workspace_roles wr
    GROUP BY wr.ws_id
  ),
  secret_counts AS (
    SELECT wse.ws_id, COUNT(*) AS cnt
    FROM workspace_secrets wse
    GROUP BY wse.ws_id
  ),
  sub_agg AS (
    SELECT
      ws_sub.ws_id,
      COUNT(*) FILTER (WHERE ws_sub.status = 'active' OR ws_sub.status = 'trialing') AS active_cnt,
      ARRAY_AGG(DISTINCT ws_sub.status::text) FILTER (WHERE ws_sub.status IS NOT NULL) AS statuses,
      MAX(
        CASE p.tier
          WHEN 'ENTERPRISE' THEN 4
          WHEN 'PRO' THEN 3
          WHEN 'PLUS' THEN 2
          WHEN 'FREE' THEN 1
          ELSE 0
        END
      ) AS max_tier_rank
    FROM workspace_subscriptions ws_sub
    LEFT JOIN workspace_subscription_products p ON p.id = ws_sub.product_id
    GROUP BY ws_sub.ws_id
  ),
  enriched AS (
    SELECT
      w.id,
      w.name,
      w.handle,
      w.avatar_url,
      COALESCE(w.personal, false) AS personal,
      w.creator_id,
      u.display_name AS creator_name,
      upd.email AS creator_email,
      w.created_at,
      COALESCE(mc.cnt, 0) AS member_count,
      COALESCE(rc.cnt, 0) AS role_count,
      COALESCE(sc.cnt, 0) AS secret_count,
      COALESCE(sa.active_cnt, 0) AS active_subscription_count,
      CASE COALESCE(sa.max_tier_rank, 0)
        WHEN 4 THEN 'ENTERPRISE'
        WHEN 3 THEN 'PRO'
        WHEN 2 THEN 'PLUS'
        WHEN 1 THEN 'FREE'
        ELSE NULL
      END AS highest_tier,
      COALESCE(sa.statuses, ARRAY[]::text[]) AS subscription_statuses
    FROM workspaces w
    LEFT JOIN users u ON u.id = w.creator_id
    LEFT JOIN user_private_details upd ON upd.user_id = w.creator_id
    LEFT JOIN member_counts mc ON mc.ws_id = w.id
    LEFT JOIN role_counts rc ON rc.ws_id = w.id
    LEFT JOIN secret_counts sc ON sc.ws_id = w.id
    LEFT JOIN sub_agg sa ON sa.ws_id = w.id
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE
      (p_search IS NULL OR p_search = '' OR
        e.name ILIKE '%' || p_search || '%' OR
        e.handle ILIKE '%' || p_search || '%' OR
        e.creator_name ILIKE '%' || p_search || '%' OR
        e.creator_email ILIKE '%' || p_search || '%')
      AND (p_tier IS NULL OR p_tier = '' OR e.highest_tier = UPPER(p_tier))
      AND (p_status IS NULL OR p_status = '' OR p_status = ANY(e.subscription_statuses))
      AND (p_workspace_type IS NULL OR p_workspace_type = '' OR
        (p_workspace_type = 'personal' AND e.personal = true) OR
        (p_workspace_type = 'team' AND e.personal = false))
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER () AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.name,
    c.handle,
    c.avatar_url,
    c.personal,
    c.creator_id,
    c.creator_name,
    c.creator_email,
    c.created_at,
    c.member_count,
    c.role_count,
    c.secret_count,
    c.active_subscription_count,
    c.highest_tier,
    c.subscription_statuses,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN p_sort_order = 'asc' THEN
      CASE p_sort_by
        WHEN 'name' THEN c.name
        WHEN 'handle' THEN c.handle
        WHEN 'highest_tier' THEN c.highest_tier
        WHEN 'creator_name' THEN c.creator_name
        WHEN 'creator_email' THEN c.creator_email
        ELSE NULL
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_order = 'desc' THEN
      CASE p_sort_by
        WHEN 'name' THEN c.name
        WHEN 'handle' THEN c.handle
        WHEN 'highest_tier' THEN c.highest_tier
        WHEN 'creator_name' THEN c.creator_name
        WHEN 'creator_email' THEN c.creator_email
        ELSE NULL
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_order = 'asc' THEN
      CASE p_sort_by
        WHEN 'member_count' THEN c.member_count
        WHEN 'role_count' THEN c.role_count
        WHEN 'secret_count' THEN c.secret_count
        WHEN 'active_subscription_count' THEN c.active_subscription_count
        ELSE NULL
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_order = 'desc' THEN
      CASE p_sort_by
        WHEN 'member_count' THEN c.member_count
        WHEN 'role_count' THEN c.role_count
        WHEN 'secret_count' THEN c.secret_count
        WHEN 'active_subscription_count' THEN c.active_subscription_count
        ELSE NULL
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_order = 'asc' THEN c.created_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'created_at' OR p_sort_by IS NULL THEN c.created_at END DESC NULLS LAST
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- Summary metrics for workspace overview dashboard cards
CREATE OR REPLACE FUNCTION get_workspace_overview_summary()
RETURNS TABLE (
  total_workspaces bigint,
  personal_workspaces bigint,
  team_workspaces bigint,
  with_active_subscription bigint,
  tier_free bigint,
  tier_plus bigint,
  tier_pro bigint,
  tier_enterprise bigint,
  avg_members numeric,
  empty_workspaces bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH member_counts AS (
    SELECT wm.ws_id, COUNT(*) AS cnt
    FROM workspace_members wm
    GROUP BY wm.ws_id
  ),
  sub_tiers AS (
    SELECT DISTINCT ON (ws_sub.ws_id)
      ws_sub.ws_id,
      ws_sub.status,
      p.tier,
      CASE p.tier
        WHEN 'ENTERPRISE' THEN 4
        WHEN 'PRO' THEN 3
        WHEN 'PLUS' THEN 2
        WHEN 'FREE' THEN 1
        ELSE 0
      END AS tier_rank
    FROM workspace_subscriptions ws_sub
    LEFT JOIN workspace_subscription_products p ON p.id = ws_sub.product_id
    WHERE ws_sub.status IN ('active', 'trialing')
    ORDER BY ws_sub.ws_id, CASE p.tier
      WHEN 'ENTERPRISE' THEN 4
      WHEN 'PRO' THEN 3
      WHEN 'PLUS' THEN 2
      WHEN 'FREE' THEN 1
      ELSE 0
    END DESC
  )
  SELECT
    COUNT(*)::bigint AS total_workspaces,
    COUNT(*) FILTER (WHERE COALESCE(w.personal, false) = true)::bigint AS personal_workspaces,
    COUNT(*) FILTER (WHERE COALESCE(w.personal, false) = false)::bigint AS team_workspaces,
    COUNT(DISTINCT st.ws_id)::bigint AS with_active_subscription,
    COUNT(DISTINCT st.ws_id) FILTER (WHERE st.tier = 'FREE')::bigint AS tier_free,
    COUNT(DISTINCT st.ws_id) FILTER (WHERE st.tier = 'PLUS')::bigint AS tier_plus,
    COUNT(DISTINCT st.ws_id) FILTER (WHERE st.tier = 'PRO')::bigint AS tier_pro,
    COUNT(DISTINCT st.ws_id) FILTER (WHERE st.tier = 'ENTERPRISE')::bigint AS tier_enterprise,
    COALESCE(ROUND(AVG(COALESCE(mc.cnt, 0)), 1), 0)::numeric AS avg_members,
    COUNT(*) FILTER (WHERE COALESCE(mc.cnt, 0) = 0)::bigint AS empty_workspaces
  FROM workspaces w
  LEFT JOIN member_counts mc ON mc.ws_id = w.id
  LEFT JOIN sub_tiers st ON st.ws_id = w.id;
END;
$$;
