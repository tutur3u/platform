create schema if not exists private;

insert into storage.buckets (id, name, public, file_size_limit)
values
    ('devbox-code-archives', 'devbox-code-archives', false, 536870912),
    ('devbox-run-artifacts', 'devbox-run-artifacts', false, 1073741824)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create table if not exists private.devbox_runners (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    status text not null default 'registered',
    capabilities jsonb not null default '{}'::jsonb,
    last_heartbeat_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists private.devbox_runner_tokens (
    id uuid primary key default gen_random_uuid(),
    runner_id uuid not null references private.devbox_runners(id) on delete cascade,
    token_hash text not null unique,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_leases (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.users(id) on delete cascade,
    runner_id uuid references private.devbox_runners(id) on delete set null,
    status text not null default 'active',
    profile text,
    keep boolean not null default false,
    expires_at timestamptz not null,
    released_at timestamptz,
    cleanup_status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists private.devbox_runs (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.users(id) on delete cascade,
    lease_id uuid not null references private.devbox_leases(id) on delete cascade,
    status text not null default 'queued',
    command text[] not null,
    env jsonb not null default '{}'::jsonb,
    env_files text[] not null default array[]::text[],
    preview_ports integer[] not null default array[]::integer[],
    timeout_seconds integer,
    exit_code integer,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists private.devbox_run_events (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references private.devbox_runs(id) on delete cascade,
    event_type text not null default 'log',
    message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_sync_artifacts (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references private.devbox_runs(id) on delete cascade,
    lease_id uuid references private.devbox_leases(id) on delete cascade,
    storage_path text not null,
    manifest jsonb not null default '{}'::jsonb,
    size_bytes bigint not null default 0,
    sha256 text,
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_artifacts (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references private.devbox_runs(id) on delete cascade,
    storage_path text not null,
    artifact_type text not null,
    size_bytes bigint not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_env_revisions (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.users(id) on delete cascade,
    lease_id uuid not null references private.devbox_leases(id) on delete cascade,
    updates jsonb not null default '{}'::jsonb,
    removals text[] not null default array[]::text[],
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_cache_records (
    id uuid primary key default gen_random_uuid(),
    runner_id uuid references private.devbox_runners(id) on delete cascade,
    cache_key text not null,
    cache_type text not null,
    size_bytes bigint not null default 0,
    compatibility jsonb not null default '{}'::jsonb,
    last_used_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (runner_id, cache_key)
);

create table if not exists private.devbox_cache_evictions (
    id uuid primary key default gen_random_uuid(),
    runner_id uuid references private.devbox_runners(id) on delete set null,
    cache_key text not null,
    reason text not null,
    size_bytes bigint not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists private.devbox_preview_requests (
    id uuid primary key default gen_random_uuid(),
    lease_id uuid not null references private.devbox_leases(id) on delete cascade,
    port integer not null,
    method text not null,
    path text not null,
    status text not null default 'queued',
    request_headers jsonb not null default '{}'::jsonb,
    response_headers jsonb not null default '{}'::jsonb,
    response_status integer,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists idx_devbox_runners_actor_status
    on private.devbox_runners(actor_id, status, updated_at desc);
create index if not exists idx_devbox_leases_actor_status
    on private.devbox_leases(actor_id, status, updated_at desc);
create index if not exists idx_devbox_leases_expiry
    on private.devbox_leases(status, expires_at);
create index if not exists idx_devbox_runs_actor_created
    on private.devbox_runs(actor_id, created_at desc);
create index if not exists idx_devbox_runs_lease_status
    on private.devbox_runs(lease_id, status, created_at desc);
create index if not exists idx_devbox_run_events_run_created
    on private.devbox_run_events(run_id, created_at);
create index if not exists idx_devbox_cache_runner_type
    on private.devbox_cache_records(runner_id, cache_type, last_used_at desc);
create index if not exists idx_devbox_preview_lease_status
    on private.devbox_preview_requests(lease_id, status, created_at);

alter table private.devbox_runners enable row level security;
alter table private.devbox_runner_tokens enable row level security;
alter table private.devbox_leases enable row level security;
alter table private.devbox_runs enable row level security;
alter table private.devbox_run_events enable row level security;
alter table private.devbox_sync_artifacts enable row level security;
alter table private.devbox_artifacts enable row level security;
alter table private.devbox_env_revisions enable row level security;
alter table private.devbox_cache_records enable row level security;
alter table private.devbox_cache_evictions enable row level security;
alter table private.devbox_preview_requests enable row level security;
