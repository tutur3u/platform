-- Add an opt-in "no authentication required" mode to profile-completion links.
-- Existing links keep requiring login (requires_auth defaults to true). When
-- false, anyone with the link may submit without an account; abuse is bounded
-- by max_uses / expires_at / revoked_at and the submission's actor is null.

alter table public.workspace_user_profile_links
  add column if not exists requires_auth boolean not null default true;

-- Re-create the stats view to expose requires_auth alongside the existing
-- computed columns (mirrors the prior extend migration's full definition).
create or replace view public.workspace_user_profile_links_with_stats as
SELECT
  wupl.id,
  wupl.ws_id,
  wupl.code,
  wupl.creator_id,
  wupl.mode,
  wupl.target_user_id,
  wupl.allowed_fields,
  wupl.max_uses,
  wupl.expires_at,
  wupl.revoked_at,
  wupl.created_at,
  wupl.updated_at,
  COUNT(wupls.id) as current_uses,
  CASE
    WHEN wupl.expires_at IS NOT NULL AND wupl.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN wupl.max_uses IS NOT NULL AND COUNT(wupls.id) >= wupl.max_uses THEN true
    ELSE false
  END as is_full,
  CASE
    WHEN wupl.revoked_at IS NOT NULL THEN true
    ELSE false
  END as is_revoked,
  wupl.prefill_existing_values,
  wupl.requires_auth
FROM public.workspace_user_profile_links wupl
LEFT JOIN public.workspace_user_profile_link_submissions wupls
  ON wupl.id = wupls.profile_link_id
GROUP BY
  wupl.id, wupl.ws_id, wupl.code, wupl.creator_id, wupl.mode,
  wupl.target_user_id, wupl.allowed_fields, wupl.max_uses, wupl.expires_at,
  wupl.revoked_at, wupl.created_at, wupl.updated_at,
  wupl.prefill_existing_values, wupl.requires_auth;

alter view public.workspace_user_profile_links_with_stats
set (security_invoker = true);

grant select on public.workspace_user_profile_links_with_stats to authenticated;
grant select on public.workspace_user_profile_links_with_stats to service_role;
