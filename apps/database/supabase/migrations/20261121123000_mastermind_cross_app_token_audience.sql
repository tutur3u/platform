-- Let targetApp mastermind mint and verify cross-app tokens.
-- packages/utils/src/internal-domains.ts includes
-- https://mastermind.tuturuuu.com. The name list stays aligned with
-- packages/utils/src/cross-app-token-apps.test.ts. Redemption for this
-- target also requires the Worker-only proof checked by Web.
-- Rollback: apps/database/rollbacks/20261121123000_mastermind_cross_app_token_audience.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

-- tuturuuu: no-grant (internal)
create or replace function private.cross_app_internal_app_names()
returns text[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select array[
    'ai', 'apps', 'calendar', 'chat', 'cms', 'colab', 'contacts', 'docs',
    'drive', 'finance', 'forms', 'git', 'hive', 'infra', 'inventory', 'learn',
    'lettin', 'mail', 'mastermind', 'meet', 'mind', 'mira', 'nova', 'parley',
    'pay', 'platform', 'qr', 'rewise', 'storefront', 'tanstack-web', 'tasks',
    'teach', 'tools', 'track', 'workspace'
  ]::text[]
$$;

revoke all on function private.cross_app_internal_app_names()
  from public, anon, authenticated;
