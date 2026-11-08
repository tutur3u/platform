-- Roll back later consumers first. Never discard enrollment data.
-- Precondition: private.devbox_personal_pool_grants must be empty. The static
-- CHECK (false) constraint below validates every existing row, so any grant
-- row aborts this transaction with check_violation before anything is dropped.
begin;
set local lock_timeout = '5s';
alter table if exists private.devbox_personal_pool_grants
    add constraint devbox_personal_pool_grants_rollback_requires_empty check (false);
drop function if exists private.devbox_identity_grant_active(uuid);
drop table if exists private.devbox_personal_pool_grants;
alter table private.devbox_control_settings drop column if exists personal_pools_enabled;
commit;
