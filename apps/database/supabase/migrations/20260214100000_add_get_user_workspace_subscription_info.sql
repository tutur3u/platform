-- Migration: Add RPC function for account deletion subscription pre-check
-- Returns workspace subscription info for a user, categorized for deletion safety checks

CREATE OR REPLACE FUNCTION public.get_user_workspace_subscription_info(_user_id UUID)
RETURNS TABLE (
  ws_id UUID,
  ws_name TEXT,
  ws_personal BOOLEAN,
  member_count BIGINT,
  polar_subscription_id TEXT,
  subscription_tier TEXT,
  pricing_model TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    w.id AS ws_id,
    COALESCE(w.name, 'Unnamed Workspace') AS ws_name,
    w.personal AS ws_personal,
    (
      SELECT COUNT(*)
      FROM workspace_members wm2
      WHERE wm2.ws_id = w.id
    ) AS member_count,
    ws_sub.polar_subscription_id,
    wsp.tier::TEXT AS subscription_tier,
    wsp.pricing_model::TEXT AS pricing_model
  FROM workspace_members wm
  JOIN workspaces w ON w.id = wm.ws_id
  LEFT JOIN workspace_subscriptions ws_sub
    ON ws_sub.ws_id = w.id
    AND ws_sub.status IN ('active', 'trialing', 'past_due')
  LEFT JOIN workspace_subscription_products wsp
    ON wsp.id = ws_sub.product_id
  WHERE wm.user_id = _user_id
    AND w.id != '00000000-0000-0000-0000-000000000000';
$$;

GRANT EXECUTE ON FUNCTION public.get_user_workspace_subscription_info(UUID) TO service_role;

COMMENT ON FUNCTION public.get_user_workspace_subscription_info(UUID) IS
  'Returns workspace subscription info for a user, used for account deletion pre-checks. '
  'Includes member count, subscription tier, and pricing model for each workspace.';
