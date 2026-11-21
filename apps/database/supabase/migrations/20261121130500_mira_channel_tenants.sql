begin;

create type private.mira_channel_kind as enum ('discord', 'whatsapp', 'zalo');
create type private.mira_connection_mode as enum ('shared_bot', 'bot', 'official', 'personal');
create type private.mira_channel_status as enum ('draft', 'connected', 'live', 'error');
create type private.mira_key_mode as enum ('managed', 'byok');
create type private.mira_preset as enum ('fast', 'quality');
create type private.mira_send_owner as enum ('m4', 'cloud');

-- Stop reasons and their owning authorities mirror @tuturuuu/mira-runtime.
-- tuturuuu: no-grant (internal)
create function private.mira_valid_stop_reasons(p_reasons text[])
returns boolean
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_reasons is not null
    and coalesce(array_ndims(p_reasons), 1) = 1
    and p_reasons <@ array['tenant', 'operator', 'billing', 'cap']::text[]
$$;
revoke all on function private.mira_valid_stop_reasons(text[]) from public, anon, authenticated, service_role;

create table private.mira_tenants (
  ws_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  key_mode private.mira_key_mode not null default 'managed',
  preset private.mira_preset not null default 'fast',
  model_id text check (model_id is null or model_id ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  never_silent boolean not null default true,
  quiet_start_minute smallint check (quiet_start_minute between 0 and 1439),
  quiet_end_minute smallint check (quiet_end_minute between 0 and 1439),
  quiet_time_zone text check (quiet_time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  -- Zero caps admit no managed spend until a manager sets them.
  daily_cap_micro_usd bigint not null default 0 check (daily_cap_micro_usd >= 0),
  monthly_cap_micro_usd bigint not null default 0 check (monthly_cap_micro_usd >= 0),
  stop_reasons text[] not null default '{}' check (private.mira_valid_stop_reasons(stop_reasons)),
  stop_generation bigint not null default 1 check (stop_generation > 0),
  config_version bigint not null default 1 check (config_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((quiet_start_minute is null) = (quiet_end_minute is null)),
  check ((quiet_end_minute is null) = (quiet_time_zone is null))
);

create table private.mira_personas (
  ws_id uuid primary key references private.mira_tenants (ws_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  instructions text not null default '' check (length(instructions) <= 8000),
  updated_at timestamptz not null default now()
);

create table private.mira_channels (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references private.mira_tenants (ws_id) on delete cascade,
  kind private.mira_channel_kind not null,
  connection_mode private.mira_connection_mode not null,
  provider_account_id text not null check (provider_account_id ~ '^[A-Za-z0-9._:@+-]{1,128}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  status private.mira_channel_status not null default 'draft',
  stop_reasons text[] not null default '{}' check (private.mira_valid_stop_reasons(stop_reasons)),
  stop_generation bigint not null default 1 check (stop_generation > 0),
  send_owner private.mira_send_owner not null default 'cloud',
  owner_generation bigint not null default 1 check (owner_generation > 0),
  last_error_code text check (last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  last_error_at timestamptz,
  last_event_at timestamptz,
  -- Unbound channels are kept so usage history and audit stay attached.
  unbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, ws_id),
  check ((last_error_code is null) = (last_error_at is null)),
  check (
    (kind = 'discord' and connection_mode in ('shared_bot', 'bot'))
    or (kind = 'whatsapp' and connection_mode in ('official', 'personal'))
    or (kind = 'zalo' and connection_mode in ('official', 'bot', 'personal'))
  ),
  -- Personal-account automation is limited to the internal root workspace.
  check (connection_mode <> 'personal' or ws_id = '00000000-0000-0000-0000-000000000000'),
  -- Only internal channels have an M4 receiver to hand over from.
  check (send_owner = 'cloud' or ws_id = '00000000-0000-0000-0000-000000000000')
);
create index mira_channels_ws on private.mira_channels (ws_id);
-- One provider account serves at most one tenant at a time.
create unique index mira_channels_bound_account
  on private.mira_channels (kind, provider_account_id) where unbound_at is null;

-- Names of vault variables per channel. Secret values are never stored here.
create table private.mira_channel_secret_refs (
  channel_id uuid not null references private.mira_channels (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{0,63}$'),
  vault_environment text not null check (vault_environment ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  vault_variable text not null check (vault_variable ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  connected_at timestamptz not null default now(),
  primary key (channel_id, name)
);

create table private.mira_usage_daily (
  ws_id uuid not null references private.mira_tenants (ws_id) on delete cascade,
  channel_id uuid not null,
  model_id text not null check (model_id ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  day date not null,
  replies bigint not null default 0 check (replies >= 0),
  weighted_replies bigint not null default 0 check (weighted_replies >= 0),
  triaged bigint not null default 0 check (triaged >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  primary key (ws_id, channel_id, model_id, day),
  foreign key (channel_id, ws_id) references private.mira_channels (id, ws_id) on delete cascade
);

-- Settlement receipts make usage writes idempotent under Queue redelivery.
create table private.mira_usage_receipts (
  receipt_id uuid primary key,
  ws_id uuid not null references private.mira_tenants (ws_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index mira_usage_receipts_created on private.mira_usage_receipts (created_at);

-- Audit survives tenant deletion and holds identifiers and codes only.
create table private.mira_audit_events (
  id bigint generated always as identity primary key,
  ws_id uuid not null,
  channel_id uuid,
  actor_kind text not null check (actor_kind in ('tenant_manager', 'operator', 'billing', 'system')),
  actor_id uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{0,63}$'),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  old_generation bigint,
  new_generation bigint,
  -- Operator-entered context; never message content or secrets.
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);
create index mira_audit_events_ws on private.mira_audit_events (ws_id, id desc);

-- The global stop fence. The channel Worker's fence object reads it.
create table private.mira_global_control (
  singleton boolean primary key default true check (singleton),
  stopped boolean not null default false,
  generation bigint not null default 1 check (generation > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into private.mira_global_control default values;

alter table private.mira_tenants enable row level security;
alter table private.mira_personas enable row level security;
alter table private.mira_channels enable row level security;
alter table private.mira_channel_secret_refs enable row level security;
alter table private.mira_usage_daily enable row level security;
alter table private.mira_usage_receipts enable row level security;
alter table private.mira_audit_events enable row level security;
alter table private.mira_global_control enable row level security;

revoke all on table private.mira_tenants, private.mira_personas, private.mira_channels,
  private.mira_channel_secret_refs, private.mira_usage_daily, private.mira_usage_receipts,
  private.mira_audit_events, private.mira_global_control
  from public, anon, authenticated, service_role;
revoke all on sequence private.mira_audit_events_id_seq from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.mira_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Mira audit events are append-only' using errcode = '55000';
end;
$$;
revoke all on function private.mira_reject_audit_mutation() from public, anon, authenticated, service_role;
create trigger mira_audit_append_only
before update or delete or truncate on private.mira_audit_events
for each statement execute function private.mira_reject_audit_mutation();

-- tuturuuu: no-grant (trigger)
create function private.mira_preserve_global_control()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'The Mira global fence row cannot be removed or replaced' using errcode = '55000';
end;
$$;
revoke all on function private.mira_preserve_global_control() from public, anon, authenticated, service_role;
create trigger mira_preserve_global_control
before insert or delete or truncate on private.mira_global_control
for each statement execute function private.mira_preserve_global_control();

-- tuturuuu: no-grant (trigger)
create function private.mira_version_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.stop_reasons := array(select distinct unnest(new.stop_reasons) order by 1);
  if tg_op = 'INSERT' then
    new.stop_generation := 1;
    new.config_version := 1;
    return new;
  end if;
  if new.ws_id is distinct from old.ws_id then
    raise exception 'Mira tenant workspace is immutable' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  new.stop_generation := old.stop_generation
    + (new.stop_reasons is distinct from old.stop_reasons)::int;
  new.config_version := old.config_version + (
    row(new.enabled, new.key_mode, new.preset, new.model_id, new.never_silent,
      new.quiet_start_minute, new.quiet_end_minute, new.quiet_time_zone,
      new.daily_cap_micro_usd, new.monthly_cap_micro_usd)
    is distinct from
    row(old.enabled, old.key_mode, old.preset, old.model_id, old.never_silent,
      old.quiet_start_minute, old.quiet_end_minute, old.quiet_time_zone,
      old.daily_cap_micro_usd, old.monthly_cap_micro_usd)
  )::int;
  return new;
end;
$$;
revoke all on function private.mira_version_tenant() from public, anon, authenticated, service_role;
create trigger mira_version_tenant
before insert or update on private.mira_tenants
for each row execute function private.mira_version_tenant();

-- tuturuuu: no-grant (trigger)
create function private.mira_version_channel()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.stop_reasons := array(select distinct unnest(new.stop_reasons) order by 1);
  if tg_op = 'INSERT' then
    new.stop_generation := 1;
    new.owner_generation := 1;
    return new;
  end if;
  -- Re-binding an account to another tenant requires unbinding first.
  if row(new.id, new.ws_id, new.kind, new.provider_account_id)
    is distinct from row(old.id, old.ws_id, old.kind, old.provider_account_id) then
    raise exception 'Mira channel binding is immutable' using errcode = '23514';
  end if;
  if old.unbound_at is not null then
    raise exception 'Unbound Mira channels are immutable' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  new.stop_generation := old.stop_generation
    + (new.stop_reasons is distinct from old.stop_reasons)::int;
  new.owner_generation := old.owner_generation
    + (new.send_owner is distinct from old.send_owner)::int;
  return new;
end;
$$;
revoke all on function private.mira_version_channel() from public, anon, authenticated, service_role;
create trigger mira_version_channel
before insert or update on private.mira_channels
for each row execute function private.mira_version_channel();

commit;
