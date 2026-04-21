-- Expose invite-link membership as `member_type` in the stats view.
-- A column named `type` can be dropped or mishandled by some JSON/OpenAPI tooling;
-- `member_type` is unambiguous for clients.

DROP VIEW IF EXISTS public.workspace_invite_links_with_stats;

CREATE OR REPLACE VIEW public.workspace_invite_links_with_stats
WITH (security_invoker = true) AS
SELECT
  wil.id,
  wil.ws_id,
  wil.code,
  wil.creator_id,
  wil.max_uses,
  wil.expires_at,
  wil.created_at,
  wil.updated_at,
  wil.type AS member_type,
  COUNT(wilu.id) AS current_uses,
  CASE
    WHEN wil.expires_at IS NOT NULL AND wil.expires_at < now() THEN true
    ELSE false
  END AS is_expired,
  CASE
    WHEN wil.max_uses IS NOT NULL AND COUNT(wilu.id) >= wil.max_uses THEN true
    ELSE false
  END AS is_full
FROM workspace_invite_links wil
LEFT JOIN workspace_invite_link_uses wilu ON wil.id = wilu.invite_link_id
GROUP BY
  wil.id,
  wil.ws_id,
  wil.code,
  wil.creator_id,
  wil.max_uses,
  wil.expires_at,
  wil.created_at,
  wil.updated_at,
  wil.type;

GRANT SELECT ON public.workspace_invite_links_with_stats TO authenticated;
GRANT SELECT ON public.workspace_invite_links_with_stats TO service_role;
