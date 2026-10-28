-- Disable first; use only before enablement with no contributor data.
begin;
do $$ begin
    if exists (select 1 from private.devbox_personal_pool_grants) then
        raise exception 'Refuse destructive identity rollback: grants exist';
    end if;
end $$;
alter table private.devbox_runs drop column access_token_id;
alter table private.devbox_leases drop column access_token_id;
alter table private.devbox_runner_tokens drop column expires_at;
drop table private.devbox_grant_events;
drop table private.devbox_access_tokens;
drop table private.devbox_personal_pool_grants;
alter table private.devbox_control_settings drop column personal_pools_enabled;
commit;
