create schema if not exists private;

create table if not exists private.github_bot_configurations (
  id text primary key,
  enabled boolean not null default false,
  app_id text not null,
  installation_id text not null,
  repository_owner text not null,
  repository_name text not null,
  permissions jsonb not null default '{"checks":"write"}'::jsonb,
  data_key_ciphertext text not null,
  private_key_encrypted text not null,
  private_key_fingerprint text not null,
  last_validated_at timestamptz,
  last_validation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint github_bot_configurations_singleton_chk
    check (id = 'tuturuuu-ci'),
  constraint github_bot_configurations_repository_owner_chk
    check (repository_owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
  constraint github_bot_configurations_repository_name_chk
    check (repository_name ~ '^[A-Za-z0-9_.-]{1,100}$'),
  constraint github_bot_configurations_app_id_chk
    check (app_id ~ '^[0-9]+$'),
  constraint github_bot_configurations_installation_id_chk
    check (installation_id ~ '^[0-9]+$')
);

create table if not exists private.github_bot_watcher_clients (
  id uuid primary key default gen_random_uuid(),
  configuration_id text not null references private.github_bot_configurations(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null,
  last_four text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  last_issued_at timestamptz
);

create unique index if not exists github_bot_watcher_clients_prefix_idx
  on private.github_bot_watcher_clients (configuration_id, token_prefix);

create table if not exists private.github_bot_audit_events (
  id uuid primary key default gen_random_uuid(),
  configuration_id text not null references private.github_bot_configurations(id) on delete cascade,
  client_id uuid references private.github_bot_watcher_clients(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint github_bot_audit_events_actor_type_chk
    check (actor_type in ('user', 'watcher'))
);

create index if not exists github_bot_audit_events_configuration_created_idx
  on private.github_bot_audit_events (configuration_id, created_at desc);

create index if not exists github_bot_watcher_clients_configuration_created_idx
  on private.github_bot_watcher_clients (configuration_id, created_at desc);

alter table private.github_bot_configurations enable row level security;
alter table private.github_bot_watcher_clients enable row level security;
alter table private.github_bot_audit_events enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

revoke all on table private.github_bot_configurations from public, anon, authenticated;
revoke all on table private.github_bot_watcher_clients from public, anon, authenticated;
revoke all on table private.github_bot_audit_events from public, anon, authenticated;

grant all on table private.github_bot_configurations to service_role;
grant all on table private.github_bot_watcher_clients to service_role;
grant all on table private.github_bot_audit_events to service_role;
