-- Roll back later consumers first. Never discard enrollment data.
begin;
set local lock_timeout = '5s';
do $$ begin
    if exists (select 1 from private.devbox_personal_pool_grants) then
        raise exception 'Refuse grant predicate rollback: grants exist';
    end if;
end $$;
drop function if exists private.devbox_identity_grant_active(uuid);
drop table if exists private.devbox_personal_pool_grants;
alter table private.devbox_control_settings drop column if exists personal_pools_enabled;
commit;
