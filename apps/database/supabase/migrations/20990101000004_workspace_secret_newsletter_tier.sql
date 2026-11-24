-- tuturuuu: no-grant (internal)
-- Registers the lower-case newsletter_sending feature flag
-- (packages/utils/src/feature-flags/data.ts) as a client-visible boolean in
-- the workspace secrets tier mirror. No other rule matches it, so without this
-- row it is credential tier: a bound Worker would store it encrypted with a
-- NULL plaintext and the flag would read as off. The row equals the matching
-- rule in packages/utils/src/workspace-secret-tier-rules.ts (priority 350,
-- after the seeded rules). Re-running is a no-op.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

INSERT INTO private.workspace_secret_name_tiers
  (priority, kind, match, tier, client_visible, value_type)
VALUES
  (350, 'exact', 'newsletter_sending', 'config', true, 'boolean')
ON CONFLICT DO NOTHING;
