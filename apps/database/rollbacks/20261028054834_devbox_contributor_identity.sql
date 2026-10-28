-- Disable first; use only before enablement with no contributor data.
begin;
do $$ begin
    if exists (select 1 from private.devbox_personal_pool_grants) then
        raise exception 'Refuse destructive identity rollback: grants exist';
    end if;
end $$;
alter table private.devbox_runs drop column if exists access_token_id;
alter table private.devbox_leases drop column if exists access_token_id;
alter table private.devbox_runner_tokens drop column if exists expires_at;
drop table if exists private.devbox_grant_events;
drop table if exists private.devbox_access_tokens;
alter table private.devbox_personal_pool_grants
    drop constraint if exists devbox_grant_lifecycle,
    drop column if exists id, drop column if exists bound_email,
    drop column if exists sessions_not_before, drop column if exists revoked_at,
    drop column if exists suspended_at, drop column if exists reason,
    drop column if exists granted_by, drop column if exists security_signoff_by,
    drop column if exists require_mfa, drop column if exists max_access_tokens,
    drop column if exists created_at, drop column if exists updated_at;
revoke insert, update, delete on private.devbox_personal_pool_grants from service_role;
commit;
