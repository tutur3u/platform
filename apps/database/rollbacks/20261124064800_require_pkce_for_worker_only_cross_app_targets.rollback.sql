-- Removes the Worker-only cross-app PKCE fence.
-- Rollback of 20261124064800_require_pkce_for_worker_only_cross_app_targets.sql.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop trigger if exists enforce_worker_only_cross_app_pkce
  on private.cross_app_tokens;
drop function if exists private.enforce_worker_only_cross_app_pkce();
drop function if exists private.cross_app_worker_only_target_names();
