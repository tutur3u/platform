begin;
drop function private.devbox_quota_limit(uuid,text);
drop table private.devbox_quota_raise_requests;
alter table private.devbox_personal_pool_grants alter column expires_at drop default;
drop function private.devbox_quota_error(text,numeric,numeric,boolean);
drop function private.devbox_quota_reset(timestamptz);
drop function private.devbox_quota_day(timestamptz);
drop index private.devbox_quota_runs_due;
drop index private.devbox_quota_active_grants;
drop table private.devbox_usage_ledger,private.devbox_quota_reservations,private.devbox_host_samples,private.devbox_host_collectors,private.devbox_quota_stops,private.devbox_quota_reaper_progress;
alter table private.devbox_personal_pool_grants drop constraint devbox_quota_grant_lifetime,drop constraint devbox_quota_default_runtime,
drop column max_concurrent_boxes,drop column max_concurrent_runs,drop column cpu_minutes_daily,drop column vcpus_per_box,
drop column memory_mib,drop column disk_gib,drop column default_run_seconds,drop column max_run_seconds,
drop column egress_bytes_daily,drop column last_collected_at,drop column egress_blocked_until;
commit;
