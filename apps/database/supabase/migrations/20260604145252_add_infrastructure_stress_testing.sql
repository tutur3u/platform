alter type "public"."workspace_role_permission"
add value if not exists 'manage_infrastructure_stress_tests';

create table if not exists private.infrastructure_stress_test_runs (
  id uuid primary key default gen_random_uuid(),
  target_id text not null,
  target_label text not null,
  target_url text not null,
  profile_id text not null,
  profile jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'aborted')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_email text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  abort_requested_at timestamptz,
  abort_requested_by uuid references auth.users(id) on delete set null,
  abort_reason text,
  summary jsonb not null default '{}'::jsonb,
  resource_spikes jsonb not null default '[]'::jsonb,
  result_notes text,
  error_message text,
  control_request_id text,
  samples_ingested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.infrastructure_stress_test_samples (
  id bigserial primary key,
  run_id uuid not null references private.infrastructure_stress_test_runs(id) on delete cascade,
  sampled_at timestamptz not null,
  requests_per_second double precision not null default 0,
  active_requests integer not null default 0,
  virtual_users integer not null default 0,
  latency_p50_ms double precision,
  latency_p95_ms double precision,
  latency_p99_ms double precision,
  error_rate double precision,
  cpu_percent double precision,
  memory_bytes double precision,
  rx_bytes double precision,
  tx_bytes double precision,
  status_codes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table private.infrastructure_stress_test_runs enable row level security;
alter table private.infrastructure_stress_test_samples enable row level security;

revoke all on table private.infrastructure_stress_test_runs
from public, anon, authenticated;
revoke all on table private.infrastructure_stress_test_samples
from public, anon, authenticated;

grant all on table private.infrastructure_stress_test_runs to service_role;
grant all on table private.infrastructure_stress_test_samples to service_role;
grant usage, select on sequence private.infrastructure_stress_test_samples_id_seq
to service_role;

create index if not exists infrastructure_stress_test_runs_status_created_idx
on private.infrastructure_stress_test_runs (status, created_at desc);

create index if not exists infrastructure_stress_test_runs_target_created_idx
on private.infrastructure_stress_test_runs (target_id, created_at desc);

create index if not exists infrastructure_stress_test_samples_run_sampled_idx
on private.infrastructure_stress_test_samples (run_id, sampled_at);

create unique index if not exists infrastructure_stress_test_samples_run_sampled_unique_idx
on private.infrastructure_stress_test_samples (run_id, sampled_at);

comment on table private.infrastructure_stress_test_runs is
  'Private persisted capacity-test run summaries for the internal infrastructure stress-testing dashboard.';

comment on table private.infrastructure_stress_test_samples is
  'Private retained per-run capacity and resource samples. Public clients must read through the Tuturuuu API proxy.';
