create schema if not exists private;

create table if not exists private.mobile_deployment_environments (
  id uuid primary key default gen_random_uuid(),
  environment text not null unique,
  active_version_id uuid,
  enabled boolean not null default true,
  github_repository text not null default 'tutur3u/platform',
  github_ref text not null default 'refs/heads/production',
  github_environment text not null default 'mobile-store-beta',
  github_workflow_ref text not null default 'tutur3u/platform/.github/workflows/mobile-deploy-stores.yaml@refs/heads/production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint mobile_deployment_environment_name_chk
    check (environment in ('production', 'staging', 'development'))
);

create table if not exists private.mobile_deployment_versions (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references private.mobile_deployment_environments(id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  data_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  constraint mobile_deployment_versions_status_chk
    check (status in ('draft', 'active', 'archived')),
  unique (environment_id, version)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mobile_deployment_environments_active_version_id_fkey'
  ) then
    alter table private.mobile_deployment_environments
      add constraint mobile_deployment_environments_active_version_id_fkey
      foreign key (active_version_id)
      references private.mobile_deployment_versions(id)
      on delete set null;
  end if;
end
$$;

create table if not exists private.mobile_deployment_secret_values (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references private.mobile_deployment_versions(id) on delete cascade,
  kind text not null,
  name text not null,
  encrypted_value text not null,
  plaintext_sha256 text not null,
  plaintext_last_four text not null,
  value_size integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint mobile_deployment_secret_values_kind_chk
    check (kind in ('env', 'scalar')),
  unique (version_id, kind, name)
);

create table if not exists private.mobile_deployment_file_artifacts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references private.mobile_deployment_versions(id) on delete cascade,
  kind text not null,
  storage_provider text not null,
  storage_path text not null,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  ciphertext_sha256 text not null,
  plaintext_sha256 text not null,
  plaintext_size integer not null,
  ciphertext_size integer not null,
  validation_status text not null default 'valid',
  validation_errors text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint mobile_deployment_file_artifacts_kind_chk
    check (
      kind in (
        'android_google_services_json',
        'ios_google_service_info_plist',
        'android_upload_keystore',
        'google_play_service_account_json',
        'apple_distribution_certificate_p12',
        'apple_app_store_provisioning_profile',
        'app_store_connect_private_key_p8'
      )
    ),
  constraint mobile_deployment_file_artifacts_provider_chk
    check (storage_provider in ('supabase', 'r2')),
  constraint mobile_deployment_file_artifacts_validation_status_chk
    check (validation_status in ('valid', 'invalid')),
  unique (version_id, kind)
);

create table if not exists private.mobile_deployment_ci_tokens (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references private.mobile_deployment_environments(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null,
  last_four text not null,
  platforms text[] not null default array['android', 'ios']::text[],
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  last_used_platform text,
  last_used_github_run_id text,
  last_used_github_run_attempt text,
  constraint mobile_deployment_ci_tokens_platforms_chk
    check (platforms <@ array['android', 'ios']::text[])
);

create unique index if not exists mobile_deployment_ci_tokens_prefix_idx
  on private.mobile_deployment_ci_tokens (environment_id, token_prefix);

create table if not exists private.mobile_deployment_bundle_fetches (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references private.mobile_deployment_environments(id) on delete cascade,
  token_id uuid references private.mobile_deployment_ci_tokens(id) on delete set null,
  version_id uuid references private.mobile_deployment_versions(id) on delete set null,
  platform text not null,
  github_run_id text,
  github_run_attempt text,
  github_sha text,
  github_workflow_ref text,
  github_actor text,
  success boolean not null default false,
  failure_code text,
  request_ip text,
  created_at timestamptz not null default now(),
  constraint mobile_deployment_bundle_fetches_platform_chk
    check (platform in ('android', 'ios'))
);

create unique index if not exists mobile_deployment_bundle_fetches_one_success_per_run_idx
  on private.mobile_deployment_bundle_fetches (
    environment_id,
    token_id,
    platform,
    github_run_id,
    github_run_attempt
  )
  where success;

create table if not exists private.mobile_deployment_audit_events (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references private.mobile_deployment_environments(id) on delete cascade,
  version_id uuid references private.mobile_deployment_versions(id) on delete set null,
  token_id uuid references private.mobile_deployment_ci_tokens(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  event_type text not null,
  resource_kind text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mobile_deployment_audit_events_actor_type_chk
    check (actor_type in ('user', 'ci'))
);

create index if not exists mobile_deployment_versions_environment_status_idx
  on private.mobile_deployment_versions (environment_id, status, version desc);

create index if not exists mobile_deployment_secret_values_version_idx
  on private.mobile_deployment_secret_values (version_id, kind, name);

create index if not exists mobile_deployment_file_artifacts_version_idx
  on private.mobile_deployment_file_artifacts (version_id, kind);

create index if not exists mobile_deployment_audit_events_environment_created_idx
  on private.mobile_deployment_audit_events (environment_id, created_at desc);

insert into private.mobile_deployment_environments (environment)
values ('production')
on conflict (environment) do nothing;

alter table private.mobile_deployment_environments enable row level security;
alter table private.mobile_deployment_versions enable row level security;
alter table private.mobile_deployment_secret_values enable row level security;
alter table private.mobile_deployment_file_artifacts enable row level security;
alter table private.mobile_deployment_ci_tokens enable row level security;
alter table private.mobile_deployment_bundle_fetches enable row level security;
alter table private.mobile_deployment_audit_events enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

revoke all on table private.mobile_deployment_environments from public, anon, authenticated;
revoke all on table private.mobile_deployment_versions from public, anon, authenticated;
revoke all on table private.mobile_deployment_secret_values from public, anon, authenticated;
revoke all on table private.mobile_deployment_file_artifacts from public, anon, authenticated;
revoke all on table private.mobile_deployment_ci_tokens from public, anon, authenticated;
revoke all on table private.mobile_deployment_bundle_fetches from public, anon, authenticated;
revoke all on table private.mobile_deployment_audit_events from public, anon, authenticated;

grant all on table private.mobile_deployment_environments to service_role;
grant all on table private.mobile_deployment_versions to service_role;
grant all on table private.mobile_deployment_secret_values to service_role;
grant all on table private.mobile_deployment_file_artifacts to service_role;
grant all on table private.mobile_deployment_ci_tokens to service_role;
grant all on table private.mobile_deployment_bundle_fetches to service_role;
grant all on table private.mobile_deployment_audit_events to service_role;
