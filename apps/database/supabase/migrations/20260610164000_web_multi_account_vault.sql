create table if not exists private.web_account_devices (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  active_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '400 days'),
  revoked_at timestamptz
);

create index if not exists web_account_devices_active_user_id_idx
  on private.web_account_devices (active_user_id)
  where active_user_id is not null;

create table if not exists private.web_account_sessions (
  device_id uuid not null references private.web_account_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  session_ciphertext text not null,
  session_expires_at timestamptz,
  last_workspace_id text,
  last_route text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

create index if not exists web_account_sessions_device_last_active_idx
  on private.web_account_sessions (device_id, last_active_at desc);

create index if not exists web_account_sessions_user_id_idx
  on private.web_account_sessions (user_id);

alter table private.web_account_devices enable row level security;
alter table private.web_account_sessions enable row level security;

revoke all on table private.web_account_devices from anon, authenticated;
revoke all on table private.web_account_sessions from anon, authenticated;
grant all on table private.web_account_devices to service_role;
grant all on table private.web_account_sessions to service_role;
