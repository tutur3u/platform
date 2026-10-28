begin;
-- Requires shared predicate 20261027152050 and SR-334 runner ownership from #7130.
-- No enrollment or enablement. Existing grant rows must remain empty before S1.
do $$ begin
    if to_regprocedure('private.devbox_identity_grant_active(uuid)') is null then
        raise exception 'Apply 20261027152050_devbox_identity_grant_predicate first';
    end if;
end $$;
alter table private.devbox_personal_pool_grants
    add column if not exists id uuid not null unique default gen_random_uuid(),
    add column if not exists bound_email text not null,
    add column if not exists sessions_not_before timestamptz not null default now(),
    add column if not exists revoked_at timestamptz,
    add column if not exists suspended_at timestamptz,
    add column if not exists reason text not null,
    add column if not exists granted_by uuid not null references public.users(id),
    add column if not exists security_signoff_by uuid not null references public.users(id),
    add column if not exists require_mfa boolean not null default true,
    add column if not exists max_access_tokens integer not null default 5 check (max_access_tokens between 1 and 5),
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();
do $$ begin
    if not exists (select 1 from pg_constraint where conrelid='private.devbox_personal_pool_grants'::regclass
        and conname='devbox_grant_lifecycle') then
        alter table private.devbox_personal_pool_grants add constraint devbox_grant_lifecycle
            check (expires_at > created_at and (status <> 'active' or accepted_at is not null)
                and ((status = 'revoked') = (revoked_at is not null)));
    end if;
end $$;

create table if not exists private.devbox_access_tokens (
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
create unique index if not exists devbox_access_tokens_live_label
    on private.devbox_access_tokens(user_id, label) where revoked_at is null;

create table if not exists private.devbox_grant_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    event_type text not null,
    subject_id uuid,
    acting_user_id uuid references public.users(id),
    acting_role text not null default session_user,
    old_status text,
    new_status text,
    created_at timestamptz not null default now()
);
alter table private.devbox_runs add column if not exists access_token_id uuid
    references private.devbox_access_tokens(id);
alter table private.devbox_leases add column if not exists access_token_id uuid
    references private.devbox_access_tokens(id);
alter table private.devbox_runner_tokens add column if not exists expires_at timestamptz;
create index if not exists devbox_runs_access_token on private.devbox_runs(access_token_id, status)
    where access_token_id is not null;
create index if not exists devbox_leases_access_token on private.devbox_leases(access_token_id, status)
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
commit;
