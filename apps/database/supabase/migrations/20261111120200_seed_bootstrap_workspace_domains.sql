-- Binds the two bootstrap hosts already served by the
-- tuturuuu-workspace-domains Worker (static host map) to their workspace, so
-- the database resolver keeps serving them and no other workspace can claim
-- them. vhp.ttr.gg is also a reserved platform label in the hostname policy.
-- The rows are staff-bypass bindings created by the workspace creator; they
-- serve only while that creator is verified Tuturuuu staff. Skipped where the
-- workspace does not exist (local and staging databases).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

WITH bootstrap(hostname, kind, token) AS (
  VALUES
    ('vhp.ttr.gg', 'platform_subdomain', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
    ('vohoangphuc.com', 'custom', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
)
INSERT INTO public.workspace_domains (
  ws_id,
  hostname,
  kind,
  verification_txt_name,
  verification_txt_value,
  ownership_status,
  ssl_status,
  entitlement_source,
  created_by
)
SELECT
  w.id,
  b.hostname,
  b.kind,
  '_tuturuuu-verify.' || b.hostname,
  'tuturuuu-domain-verification=' || b.token,
  'verified',
  'active',
  'staff_bypass',
  w.creator_id
FROM bootstrap b
CROSS JOIN public.workspaces w
WHERE w.id = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1'
  AND coalesce(w.deleted, false) = false
ON CONFLICT (hostname) WHERE status <> 'removed' DO NOTHING;

-- The insert guard starts every row pending; these hosts are already live
-- (routes and certificates attached by the operator during bootstrap).
UPDATE public.workspace_domains
SET status = 'active', activated_at = now(), last_checked_at = now()
WHERE ws_id = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1'
  AND hostname IN ('vhp.ttr.gg', 'vohoangphuc.com')
  AND status = 'pending_verification';

COMMIT;
