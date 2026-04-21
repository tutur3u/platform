-- Invite links: store member type (MEMBER vs GUEST) for join-via-link flow

ALTER TABLE public.workspace_invite_links
ADD COLUMN type public.workspace_member_type NOT NULL DEFAULT 'MEMBER';

DROP VIEW IF EXISTS public.workspace_invite_links_with_stats;

CREATE OR REPLACE VIEW public.workspace_invite_links_with_stats AS
SELECT
  wil.id,
  wil.ws_id,
  wil.code,
  wil.creator_id,
  wil.max_uses,
  wil.expires_at,
  wil.created_at,
  wil.updated_at,
  wil.type,
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

-- DROP VIEW removes prior grants; restore (matches 20251015180000_workspace_invite_links.sql)
GRANT SELECT ON public.workspace_invite_links_with_stats TO authenticated;
GRANT SELECT ON public.workspace_invite_links_with_stats TO service_role;
