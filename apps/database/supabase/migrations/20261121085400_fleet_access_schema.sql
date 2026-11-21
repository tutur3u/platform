begin;

create type private.fleet_tier as enum ('observer', 'steerer', 'operator', 'owner');
create type private.fleet_intent_kind as enum (
  'status_question', 'comment', 'priority.set', 'approve.item', 'work.create',
  'work.redirect', 'lane.pause', 'approve.deploy', 'approve.production_change'
);
create type private.fleet_intent_state as enum (
  'pending_approval', 'approved', 'rejected', 'claimed', 'dispatched',
  'done', 'failed', 'expired', 'cancelled'
);
create type private.fleet_risk as enum ('none', 'low', 'medium', 'high');

create table private.fleet_projects (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name_en text not null check (length(btrim(name_en)) > 0),
  name_vi text not null check (length(btrim(name_vi)) > 0),
  default_risk private.fleet_risk not null default 'low',
  target_mapping jsonb not null default '{}' check (jsonb_typeof(target_mapping) = 'object'),
  target_mapping_version bigint not null default 1 check (target_mapping_version > 0)
);

create table private.fleet_access_grants (
  user_id uuid primary key,
  auth_user_id uuid references auth.users (id) on delete set null,
  tier private.fleet_tier not null,
  capabilities text[] not null,
  questions_per_hour integer not null default 30 check (questions_per_hour >= 0),
  intents_per_day integer not null default 10 check (intents_per_day >= 0),
  model_budget_per_month bigint not null default 0 check (model_budget_per_month >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  generation bigint not null default 1 check (generation > 0),
  check (auth_user_id is not distinct from user_id or (auth_user_id is null and revoked_at is not null))
);
create index fleet_access_grants_auth_user on private.fleet_access_grants (auth_user_id);

create table private.fleet_access_grant_projects (
  user_id uuid not null references private.fleet_access_grants (user_id) on delete cascade,
  project_key text not null references private.fleet_projects (key),
  primary key (user_id, project_key)
);

create table private.fleet_channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'zalo', 'discord')),
  provider_account_id text not null check (length(provider_account_id) > 0),
  sender_hash bytea not null check (octet_length(sender_hash) = 32),
  private_conversation_id text not null check (length(private_conversation_id) > 0),
  verified_at timestamptz not null default now(),
  unique (channel, provider_account_id, sender_hash)
);

create table private.fleet_control (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid references auth.users (id) on delete set null,
  stopped boolean not null default false,
  generation bigint not null default 1 check (generation > 0)
);

-- The database owner configures the Owner UUID separately from explicit root access.
insert into private.fleet_control default values;

create table private.fleet_intents (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references private.fleet_access_grants (user_id),
  channel text not null check (channel in ('web', 'mobile', 'whatsapp', 'zalo', 'discord')),
  kind private.fleet_intent_kind not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  risk private.fleet_risk not null,
  action_hash bytea not null check (octet_length(action_hash) = 32),
  project_versions jsonb not null check (
    jsonb_typeof(project_versions) = 'object' and project_versions <> '{}'::jsonb
  ),
  requester_generation bigint not null check (requester_generation > 0),
  stop_generation bigint not null check (stop_generation > 0),
  requires_owner_approval boolean not null default false,
  state private.fleet_intent_state not null default 'pending_approval',
  approver_id uuid,
  approver_generation bigint check (approver_generation > 0),
  lease_id uuid,
  lease_expires_at timestamptz,
  idempotency_key uuid not null unique,
  receipt jsonb check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at),
  check (risk <> 'high' or approver_id is distinct from requester_id),
  check ((approver_id is null) = (approver_generation is null)),
  check ((lease_id is null) = (lease_expires_at is null)),
  check (state not in ('claimed', 'dispatched') or lease_id is not null)
);

create index fleet_intents_question_quota
  on private.fleet_intents (requester_id, created_at) where kind = 'status_question';
create index fleet_intents_action_quota
  on private.fleet_intents (requester_id, created_at) where kind <> 'status_question';

create table private.fleet_intent_quotes (
  intent_id uuid primary key references private.fleet_intents (id) on delete cascade,
  redacted_quote text not null check (length(btrim(redacted_quote)) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
    generated always as (((created_at at time zone 'UTC') + interval '90 days') at time zone 'UTC') stored
);
create index fleet_intent_quotes_expiry on private.fleet_intent_quotes (expires_at);

create table private.fleet_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  channel text not null check (channel in ('web', 'mobile', 'whatsapp', 'zalo', 'discord')),
  action text not null check (action ~ '^[a-z][a-z0-9_.]{0,63}$'),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  subject_user_id uuid,
  intent_id uuid,
  created_at timestamptz not null default now()
);

alter table private.fleet_projects enable row level security;
alter table private.fleet_access_grants enable row level security;
alter table private.fleet_access_grant_projects enable row level security;
alter table private.fleet_channel_identities enable row level security;
alter table private.fleet_control enable row level security;
alter table private.fleet_intents enable row level security;
alter table private.fleet_intent_quotes enable row level security;
alter table private.fleet_audit_events enable row level security;

revoke all on table private.fleet_projects, private.fleet_access_grants,
  private.fleet_access_grant_projects, private.fleet_channel_identities,
  private.fleet_control, private.fleet_intents, private.fleet_intent_quotes,
  private.fleet_audit_events from public, anon, authenticated, service_role;
revoke all on sequence private.fleet_audit_events_id_seq from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.fleet_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Fleet audit events are append-only' using errcode = '55000';
end;
$$;
revoke all on function private.fleet_reject_audit_mutation() from public, anon, authenticated, service_role;

create trigger fleet_audit_append_only
before update or delete or truncate on private.fleet_audit_events
for each statement execute function private.fleet_reject_audit_mutation();

-- tuturuuu: no-grant (trigger)
create function private.fleet_reject_fence_reset()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Fleet fence rows cannot be removed or replaced' using errcode = '55000';
end;
$$;
revoke all on function private.fleet_reject_fence_reset() from public, anon, authenticated, service_role;

create trigger fleet_preserve_grant_fence
before delete or truncate on private.fleet_access_grants
for each statement execute function private.fleet_reject_fence_reset();

create trigger fleet_preserve_project_fence
before delete or truncate on private.fleet_projects
for each statement execute function private.fleet_reject_fence_reset();

create trigger fleet_preserve_control_fence
before insert or delete or truncate on private.fleet_control
for each statement execute function private.fleet_reject_fence_reset();

-- tuturuuu: no-grant (trigger)
create function private.fleet_check_grant()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_allowed text[] := array['status.read', 'ask', 'intent.request'];
begin
  if new.tier = 'owner' then
    raise exception 'The Owner tier cannot be granted' using errcode = '23514';
  end if;
  if new.tier >= 'steerer' then
    v_allowed := v_allowed || array['work.create', 'work.redirect', 'priority.set', 'comment', 'approve.low'];
  end if;
  if new.tier = 'operator' then
    v_allowed := v_allowed || array['approve.deploy', 'approve.production_change', 'lane.pause'];
  end if;

  if new.capabilities is null
    or new.capabilities <@ v_allowed is distinct from true
    or coalesce(array_ndims(new.capabilities), 1) <> 1 then
    raise exception 'Capabilities exceed the Fleet tier ceiling' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.auth_user_id := new.user_id;
    new.generation := 1;
    return new;
  end if;
  if new.user_id is distinct from old.user_id
    or new.generation not in (old.generation, old.generation + 1) then
    raise exception 'Invalid Fleet grant identity or generation' using errcode = '23514';
  end if;
  if new.auth_user_id is null and old.auth_user_id is not null then
    new.revoked_at := coalesce(new.revoked_at, clock_timestamp());
  end if;
  if row(new.auth_user_id, new.tier, new.capabilities, new.expires_at, new.revoked_at,
      new.questions_per_hour, new.intents_per_day, new.model_budget_per_month)
    is distinct from
    row(old.auth_user_id, old.tier, old.capabilities, old.expires_at, old.revoked_at,
      old.questions_per_hour, old.intents_per_day, old.model_budget_per_month) then
    new.generation := old.generation + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_check_grant() from public, anon, authenticated, service_role;

create trigger fleet_check_grant
before insert or update on private.fleet_access_grants
for each row execute function private.fleet_check_grant();

-- tuturuuu: no-grant (trigger)
create function private.fleet_version_project()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.target_mapping_version := 1;
  elsif new.key is distinct from old.key then
    raise exception 'Fleet project keys are immutable' using errcode = '23514';
  elsif new.target_mapping is distinct from old.target_mapping
    or new.default_risk is distinct from old.default_risk then
    new.target_mapping_version := old.target_mapping_version + 1;
  else
    new.target_mapping_version := old.target_mapping_version;
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_version_project() from public, anon, authenticated, service_role;

create trigger fleet_version_project
before insert or update on private.fleet_projects
for each row execute function private.fleet_version_project();

-- tuturuuu: no-grant (trigger)
create function private.fleet_version_control()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.generation := old.generation;
  if row(new.owner_user_id, new.stopped) is distinct from row(old.owner_user_id, old.stopped) then
    new.generation := old.generation + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_version_control() from public, anon, authenticated, service_role;

create trigger fleet_version_control
before update on private.fleet_control
for each row execute function private.fleet_version_control();

-- tuturuuu: no-grant (trigger)
create function private.fleet_check_intent_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if old.state in ('done', 'failed', 'rejected', 'expired', 'cancelled') then
    raise exception 'Terminal Fleet intents are immutable' using errcode = '23514';
  end if;
  if row(new.id, new.requester_id, new.channel, new.kind, new.payload, new.risk,
    new.action_hash, new.project_versions, new.requester_generation, new.stop_generation,
    new.requires_owner_approval, new.idempotency_key, new.created_at, new.expires_at)
    is distinct from
    row(old.id, old.requester_id, old.channel, old.kind, old.payload, old.risk,
    old.action_hash, old.project_versions, old.requester_generation, old.stop_generation,
    old.requires_owner_approval, old.idempotency_key, old.created_at, old.expires_at) then
    raise exception 'Fleet intent action is immutable' using errcode = '23514';
  end if;

  if new.state is distinct from old.state and not (case old.state
    when 'pending_approval' then new.state in ('approved', 'rejected', 'expired', 'cancelled')
    when 'approved' then new.state in ('claimed', 'expired', 'cancelled')
    when 'claimed' then new.state in ('dispatched', 'failed', 'expired', 'cancelled')
    when 'dispatched' then new.state in ('done', 'failed')
    else false
  end) then
    raise exception 'Invalid Fleet intent state transition' using errcode = '23514';
  end if;
  if new.state is distinct from old.state then
    if new.state in ('approved', 'claimed') and v_now >= old.expires_at then
      raise exception 'Fleet intent has expired' using errcode = '23514';
    end if;
    if new.state = 'expired' and v_now < old.expires_at then
      raise exception 'Fleet intent has not expired' using errcode = '23514';
    end if;
  end if;
  if old.state = 'pending_approval' and new.state = 'approved' and new.approver_id is null then
    raise exception 'Fleet approval requires an approver' using errcode = '23514';
  end if;
  if old.state <> 'pending_approval'
    and row(new.approver_id, new.approver_generation)
      is distinct from row(old.approver_id, old.approver_generation) then
    raise exception 'Fleet intent approval is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_check_intent_transition() from public, anon, authenticated, service_role;

create trigger fleet_check_intent_transition
before update on private.fleet_intents
for each row execute function private.fleet_check_intent_transition();

commit;
