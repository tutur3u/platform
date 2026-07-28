-- Git satellite configuration, repository allowlist, and audit history.
alter type public.workspace_role_permission
  add value if not exists 'manage_git_repositories';

create schema if not exists private;

create table if not exists private.git_app_configurations (
  id text primary key,
  enabled boolean not null default false,
  app_id text not null,
  installation_id text not null,
  permissions jsonb not null default
    '{"actions":"read","checks":"read","commit_statuses":"read","contents":"read","issues":"read","pull_requests":"read","metadata":"read"}'::jsonb,
  data_key_ciphertext text not null,
  private_key_encrypted text not null,
  private_key_fingerprint text not null,
  last_validated_at timestamptz,
  last_validation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint git_app_configurations_singleton_chk check (id = 'primary'),
  constraint git_app_configurations_app_id_chk check (app_id ~ '^[0-9]+$'),
  constraint git_app_configurations_installation_id_chk
    check (installation_id ~ '^[0-9]+$')
);

create table if not exists private.git_repositories (
  id uuid primary key default gen_random_uuid(),
  github_repository_id bigint not null unique,
  owner_login text not null,
  name text not null,
  default_branch text not null default 'main',
  description text,
  homepage_url text,
  visibility text not null default 'public',
  archived boolean not null default false,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint git_repositories_owner_chk
    check (owner_login ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  constraint git_repositories_name_chk
    check (name ~ '^[A-Za-z0-9_.-]{1,100}$'),
  constraint git_repositories_public_only_chk check (visibility = 'public')
);

create unique index if not exists git_repositories_owner_name_idx
  on private.git_repositories (lower(owner_login), lower(name));

create index if not exists git_repositories_enabled_idx
  on private.git_repositories (enabled, updated_at desc);

create table if not exists private.git_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  repository_id uuid references private.git_repositories(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint git_audit_events_event_type_chk
    check (event_type ~ '^[a-z0-9_.-]{1,100}$')
);

create index if not exists git_audit_events_created_idx
  on private.git_audit_events (created_at desc);

alter table private.git_app_configurations enable row level security;
alter table private.git_repositories enable row level security;
alter table private.git_audit_events enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

revoke all on table private.git_app_configurations
  from public, anon, authenticated;
revoke all on table private.git_repositories
  from public, anon, authenticated;
revoke all on table private.git_audit_events
  from public, anon, authenticated;

grant all on table private.git_app_configurations to service_role;
grant all on table private.git_repositories to service_role;
grant all on table private.git_audit_events to service_role;

insert into private.git_repositories (
  github_repository_id,
  owner_login,
  name,
  default_branch,
  description,
  homepage_url,
  visibility,
  archived,
  enabled,
  last_synced_at
)
values (
  536896722,
  'tutur3u',
  'platform',
  'main',
  'Tuturuuu is an AI-native, open-source workspace for tasks, scheduling, and team collaboration.',
  'https://tuturuuu.com',
  'public',
  false,
  true,
  now()
)
on conflict (github_repository_id) do update
set
  owner_login = excluded.owner_login,
  name = excluded.name,
  default_branch = excluded.default_branch,
  description = excluded.description,
  homepage_url = excluded.homepage_url,
  visibility = excluded.visibility,
  archived = excluded.archived,
  enabled = excluded.enabled,
  updated_at = now();

comment on table private.git_app_configurations is
  'Envelope-encrypted credentials for the read-only Tuturuuu Git GitHub App.';
comment on table private.git_repositories is
  'Public GitHub repositories approved for display on git.tuturuuu.com.';
comment on table private.git_audit_events is
  'Administrative audit trail for Git credentials, repositories, and cache operations.';
