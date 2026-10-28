-- S1 only: no grant, runner, claim-fence replacement or enablement.
-- SR-332/333/334 remain owned by TT Security. No existing function is redefined.
-- Existing singleton and mode gate are owned by 20261026145000:50-59.
alter table private.devbox_control_settings
    add column personal_pools_enabled boolean not null default false;

create table private.devbox_personal_pool_grants (
    user_id uuid primary key references public.users(id) on delete cascade,
    id uuid not null unique default gen_random_uuid(),
    bound_email text not null,
    status text not null default 'pending'
        check (status in ('pending', 'active', 'suspended', 'revoked')),
    expires_at timestamptz not null,
    accepted_at timestamptz,
    sessions_not_before timestamptz not null default now(),
    revoked_at timestamptz,
    suspended_at timestamptz,
    reason text not null,
    granted_by uuid not null references public.users(id),
    security_signoff_by uuid not null references public.users(id),
    require_mfa boolean not null default true,
    max_access_tokens integer not null default 5 check (max_access_tokens between 1 and 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (expires_at > created_at),
    check (status <> 'active' or accepted_at is not null)
);

create table private.devbox_access_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references private.devbox_personal_pool_grants(user_id) on delete cascade,
    grant_id uuid not null references private.devbox_personal_pool_grants(id) on delete cascade,
    label text not null check (label ~ '^[a-z0-9-]{1,40}$'),
    token_prefix text not null check (token_prefix ~ '^tdba_[a-f0-9]{8}$'),
    token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
    scopes text[] not null check (cardinality(scopes) > 0 and
        scopes <@ array['devbox:run', 'devbox:build', 'devbox:read']::text[]
        and array_position(scopes, null) is null),
    expires_at timestamptz not null,
    last_used_at timestamptz,
    revoked_at timestamptz,
    revoked_by uuid references public.users(id),
    created_at timestamptz not null default now(),
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create unique index devbox_access_tokens_live_label
    on private.devbox_access_tokens(user_id, label) where revoked_at is null;

create table private.devbox_grant_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    event_type text not null,
    subject_id uuid,
    created_at timestamptz not null default now()
);
alter table private.devbox_runs add column access_token_id uuid
    references private.devbox_access_tokens(id);
alter table private.devbox_leases add column access_token_id uuid
    references private.devbox_access_tokens(id);
alter table private.devbox_runner_tokens add column expires_at timestamptz;
create index devbox_runs_access_token on private.devbox_runs(access_token_id, status)
    where access_token_id is not null;
create index devbox_leases_access_token on private.devbox_leases(access_token_id, status)
    where access_token_id is not null;

alter table private.devbox_control_settings enable row level security;
alter table private.devbox_personal_pool_grants enable row level security;
alter table private.devbox_access_tokens enable row level security;
alter table private.devbox_grant_events enable row level security;
revoke all on private.devbox_control_settings, private.devbox_personal_pool_grants,
    private.devbox_access_tokens, private.devbox_grant_events from public, anon, authenticated;
grant select, insert, update, delete on private.devbox_personal_pool_grants,
    private.devbox_access_tokens to service_role;
grant select, insert on private.devbox_grant_events to service_role;
