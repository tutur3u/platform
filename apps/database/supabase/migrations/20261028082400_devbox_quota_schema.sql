begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table private.devbox_personal_pool_grants alter column expires_at set default (now()+interval '30 days');
alter table private.devbox_personal_pool_grants
 add column max_concurrent_boxes integer not null default 2 check (max_concurrent_boxes between 1 and 4),
 add column max_concurrent_runs integer not null default 2 check (max_concurrent_runs between 1 and 4),
 add column cpu_minutes_daily integer not null default 480 check (cpu_minutes_daily between 1 and 1920),
 add column vcpus_per_box integer not null default 4 check (vcpus_per_box between 1 and 4),
 add column memory_mib integer not null default 8192 check (memory_mib between 512 and 16384),
 add column disk_gib integer not null default 60 check (disk_gib between 1 and 120),
 add column default_run_seconds integer not null default 1800 check (default_run_seconds between 1 and 7200),
 add column max_run_seconds integer not null default 7200 check (max_run_seconds between 1 and 7200),
 add column egress_bytes_daily bigint not null default 10737418240 check (egress_bytes_daily between 1 and 42949672960),
 add column last_collected_at timestamptz,
 add column egress_blocked_until timestamptz,
 add constraint devbox_quota_default_runtime check (default_run_seconds <= max_run_seconds),
 add constraint devbox_quota_grant_lifetime check (expires_at <= created_at + interval '30 days') not valid;

create table private.devbox_quota_reservations (
 run_id uuid primary key references private.devbox_runs(id) on delete cascade,
 user_id uuid not null references private.devbox_personal_pool_grants(user_id),
 allocated_vcpus integer not null check (allocated_vcpus between 1 and 4),
 reserved_minutes integer not null check (reserved_minutes > 0),
 timeout_seconds integer not null check (timeout_seconds between 1 and 7200),
 admitted_at timestamptz not null default clock_timestamp(),
 started_at timestamptz,
 ended_at timestamptz,
 check (ended_at is null or ended_at >= coalesce(started_at,admitted_at))
);
create index devbox_quota_reservations_actor on private.devbox_quota_reservations(user_id, ended_at);
create table private.devbox_usage_ledger (
 run_id uuid not null references private.devbox_quota_reservations(run_id) on delete cascade,
 user_id uuid not null references private.devbox_personal_pool_grants(user_id),
 usage_day date not null,
 cpu_minutes integer not null check (cpu_minutes >= 0),
 primary key (run_id, usage_day)
);
create index devbox_usage_ledger_actor_day on private.devbox_usage_ledger(user_id,usage_day);
create table private.devbox_host_collectors (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references private.devbox_personal_pool_grants(user_id),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create table private.devbox_host_samples (
 collector_id uuid not null references private.devbox_host_collectors(id),
 sample_id uuid not null,
 received_at timestamptz not null default clock_timestamp(),
 usage_day date not null,
 host_cpu_minutes numeric not null check (host_cpu_minutes >= 0),
 egress_bytes bigint not null check (egress_bytes >= 0),
 idle_cpu_percent numeric not null check (idle_cpu_percent between 0 and 400),
 idle_seconds integer not null check (idle_seconds between 0 and 86400),
 primary key (collector_id, sample_id)
);
create index devbox_host_samples_day on private.devbox_host_samples(collector_id,usage_day,received_at desc);
create table private.devbox_quota_stops (
 user_id uuid primary key references private.devbox_personal_pool_grants(user_id),
 reason text not null check (reason in ('hard_cpu','idle_burn','max_runtime','collector_silent')),
 requested_at timestamptz not null default clock_timestamp(),
 acknowledged_at timestamptz,
 alert_pending boolean not null default true
);
create table private.devbox_quota_reaper_progress (
 id boolean primary key default true check (id),
 enabled boolean not null default false,
 last_tick timestamptz,
 cursor_user_id uuid,
 runs_reaped bigint not null default 0
);
insert into private.devbox_quota_reaper_progress(id) values(true);
create index devbox_quota_active_grants on private.devbox_personal_pool_grants(user_id) where status='active';
create index devbox_quota_runs_due on private.devbox_runs(actor_id,started_at,id)
 where status in ('running','cancel_requested');

create function private.devbox_quota_day(p_at timestamptz)
returns date language sql immutable set search_path = pg_catalog, pg_temp as $$
 select (p_at at time zone 'Asia/Ho_Chi_Minh')::date;
$$;
create function private.devbox_quota_reset(p_at timestamptz)
returns timestamptz language sql immutable set search_path = pg_catalog, pg_temp as $$
 select (private.devbox_quota_day(p_at) + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
$$;
create function private.devbox_quota_error(p_limit text,p_used numeric,p_max numeric,p_exceeds boolean default false)
returns void language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
 raise exception using errcode='P0001', message=case when p_exceeds then 'DEVBOX_LIMIT_EXCEEDS_GRANT' else 'DEVBOX_LIMIT_REACHED' end,
 detail=jsonb_build_object('limit',p_limit,'used',p_used,'max',p_max,'resetsAt',private.devbox_quota_reset(clock_timestamp()))::text;
end;
$$;

create table private.devbox_quota_raise_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references private.devbox_personal_pool_grants(user_id),
 limit_name text not null check(limit_name in ('cpu_minutes_daily','max_concurrent_boxes','max_concurrent_runs','egress_bytes_daily','memory_mib','disk_gib')),
 requested_max bigint not null check(requested_max>0),
 reason text not null check(length(reason) between 1 and 1000),
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','denied')),
 decided_by uuid references public.users(id),
 decided_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at>created_at and expires_at<=created_at+interval '7 days')
);
alter table private.devbox_quota_raise_requests enable row level security;
revoke all on private.devbox_quota_raise_requests from public,anon,authenticated;
create function private.devbox_quota_limit(p_user_id uuid,p_limit text)
returns numeric language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select greatest((to_jsonb(g)->>p_limit)::numeric,coalesce((select max(requested_max) from private.devbox_quota_raise_requests
 where user_id=p_user_id and limit_name=p_limit and status='approved' and expires_at>now()),0))
 from private.devbox_personal_pool_grants g where user_id=p_user_id;
$$;

do $$ declare t text; f record; begin
 foreach t in array array['devbox_quota_reservations','devbox_usage_ledger','devbox_host_collectors',
 'devbox_host_samples','devbox_quota_stops','devbox_quota_reaper_progress'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public, anon, authenticated',t);
 end loop;
 grant select on private.devbox_quota_stops to service_role;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and proname like 'devbox_quota_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
