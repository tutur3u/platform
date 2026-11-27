-- Register Worlds as a satellite audience and require PKCE on every mint.
-- Rollback: apps/database/rollbacks/20261127104100_worlds_cross_app_token_audience.rollback.sql

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
    'teach', 'tools', 'track', 'whiteboards', 'workspace', 'worlds'
  ]::text[]
$$;

revoke all on function private.cross_app_internal_app_names()
  from public, anon, authenticated;

-- tuturuuu: no-grant (internal)
create or replace function private.cross_app_worker_only_target_names()
returns text[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select array['mastermind', 'worlds']::text[]
$$;

revoke all on function private.cross_app_worker_only_target_names()
  from public, anon, authenticated;
