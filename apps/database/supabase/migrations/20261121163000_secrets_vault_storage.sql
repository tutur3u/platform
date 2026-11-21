-- Secrets vault storage (apps/docs/platform/architecture/secrets-vault.mdx).
-- Every row holds client-produced, signed or encrypted bytes; the database
-- never sees a plaintext value or an unwrapped key. The witness is the commit
-- point; these tables are the store, so publication is idempotent by sequence
-- or content hash. Tables are reachable only through the definers in
-- 20261121163001_secrets_vault_functions.sql and
-- 20261121163002_secrets_vault_actor_functions.sql, which run as vault_definer:
-- a NOLOGIN role whose only privileges are these tables, through policies
-- scoped to that role.
-- tuturuuu: no-grant (internal)
begin;
set local lock_timeout = '3s';

create role vault_definer nologin noinherit nocreaterole nocreatedb nobypassrls;
grant usage on schema private to vault_definer;
-- Schema usage only, to call public.is_org_member;
-- vault_definer holds no privilege on any public table.
grant usage on schema public to vault_definer;
grant vault_definer to postgres;

create table private.vault_genesis (
  ws_id uuid primary key references public.workspaces (id) on delete cascade,
  vault_id bytea not null unique check (octet_length(vault_id) = 32),
  signed_genesis bytea not null check (octet_length(signed_genesis) between 1 and 65536),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table private.vault_key_log (
  ws_id uuid not null references private.vault_genesis (ws_id) on delete cascade,
  seq bigint not null check (seq >= 1),
  entry_hash bytea not null check (octet_length(entry_hash) = 32),
  signed_entry bytea not null check (octet_length(signed_entry) between 1 and 262144),
  published_at timestamptz not null default now(),
  primary key (ws_id, seq),
  unique (ws_id, entry_hash)
);

-- Payloads are uploaded before the witness commit and promoted only when a
-- committed transition names their hash; unpromoted payloads expire.
create table private.vault_staged_payloads (
  ws_id uuid not null references private.vault_genesis (ws_id) on delete cascade,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  kind text not null check (kind in ('ciphertext', 'wrap')),
  payload bytea not null check (octet_length(payload) between 1 and 1048576),
  staged_by uuid references auth.users (id) on delete set null,
  staged_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (ws_id, payload_hash)
);

create index vault_staged_payloads_expiry_idx
  on private.vault_staged_payloads (expires_at);

create table private.vault_records (
  ws_id uuid not null references private.vault_genesis (ws_id) on delete cascade,
  record_hash bytea not null check (octet_length(record_hash) = 32),
  env text not null check (char_length(env) between 1 and 256),
  variable_id text not null check (char_length(variable_id) between 1 and 256),
  version integer not null check (version >= 1),
  signed_record bytea not null check (octet_length(signed_record) between 1 and 65536),
  ciphertext_hash bytea check (ciphertext_hash is null or octet_length(ciphertext_hash) = 32),
  ciphertext bytea check (ciphertext is null or octet_length(ciphertext) between 1 and 1048576),
  published_at timestamptz not null default now(),
  primary key (ws_id, record_hash),
  unique (ws_id, env, variable_id, version),
  -- Tombstones carry neither; values carry both, and the bytes match the hash.
  constraint vault_records_ciphertext_chk check (
    (ciphertext is null and ciphertext_hash is null)
    or (ciphertext is not null and ciphertext_hash = pg_catalog.sha256(ciphertext))
  )
);

create index vault_records_variable_idx
  on private.vault_records (ws_id, env, variable_id, version desc);

create table private.vault_wraps (
  ws_id uuid not null references private.vault_genesis (ws_id) on delete cascade,
  env text not null check (char_length(env) between 1 and 256),
  epoch integer not null check (epoch >= 1),
  recipient_fp bytea not null check (octet_length(recipient_fp) = 32),
  key_kind text not null
    check (key_kind in ('edk', 'intake', 'esk', 'history-normal', 'history-sensitive')),
  wrap bytea not null check (octet_length(wrap) between 1 and 4096),
  digest bytea not null check (octet_length(digest) = 32),
  published_at timestamptz not null default now(),
  primary key (ws_id, env, epoch, recipient_fp, key_kind),
  constraint vault_wraps_digest_chk check (digest = pg_catalog.sha256(wrap))
);

create index vault_wraps_recipient_idx
  on private.vault_wraps (ws_id, recipient_fp, env, epoch);

-- One keyring per user; the witness holds its authoritative head.
create table private.vault_keyrings (
  vault_user_id bytea primary key check (octet_length(vault_user_id) = 16),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  counter bigint not null check (counter >= 0),
  keyring bytea not null check (octet_length(keyring) between 1 and 262144),
  updated_at timestamptz not null default now()
);

create table private.vault_unlock_wraps (
  vault_user_id bytea not null references private.vault_keyrings (vault_user_id) on delete cascade,
  method text not null check (method in ('passkey', 'recovery', 'pin')),
  method_id bytea not null check (octet_length(method_id) between 16 and 1024),
  params bytea not null check (octet_length(params) between 1 and 4096),
  wrap bytea not null check (octet_length(wrap) between 1 and 4096),
  created_at timestamptz not null default now(),
  primary key (vault_user_id, method, method_id)
);

-- Vault passkeys use the vault.tuturuuu.com RP ID and are never login passkeys.
create table private.vault_passkeys (
  credential_id bytea primary key check (octet_length(credential_id) between 16 and 1023),
  vault_user_id bytea not null references private.vault_keyrings (vault_user_id) on delete cascade,
  public_key bytea not null check (octet_length(public_key) between 32 and 2048),
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[] not null default '{}' check (cardinality(transports) <= 8),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index vault_passkeys_user_idx on private.vault_passkeys (vault_user_id);

-- Server-trusted audit: names and identifiers only, never values or keys.
create table private.vault_audit_events (
  id bigint generated always as identity primary key,
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  actor_kind text not null check (actor_kind in ('user', 'machine', 'ci', 'workload', 'sync')),
  actor_id text not null check (char_length(actor_id) between 1 and 256),
  event text not null check (event ~ '^[a-z][a-z0-9_.]{0,63}$'),
  resource jsonb not null default '{}'::jsonb
    check (jsonb_typeof(resource) = 'object' and octet_length(resource::text) <= 4096),
  ip_prefix cidr,
  ua_family text check (ua_family is null or char_length(ua_family) <= 64),
  grant_id text check (grant_id is null or char_length(grant_id) <= 128),
  result text not null check (result in ('ok', 'denied', 'error')),
  prev_hash bytea check (prev_hash is null or octet_length(prev_hash) = 32),
  event_hash bytea not null check (octet_length(event_hash) = 32),
  created_at timestamptz not null default now(),
  -- IPv4 truncated to /24 and IPv6 to /48 before storage.
  constraint vault_audit_ip_prefix_chk check (
    ip_prefix is null
    or (family(ip_prefix) = 4 and masklen(ip_prefix) <= 24)
    or (family(ip_prefix) = 6 and masklen(ip_prefix) <= 48)
  )
);

create index vault_audit_events_ws_created_idx
  on private.vault_audit_events (ws_id, created_at desc);

alter table private.vault_genesis enable row level security;
alter table private.vault_key_log enable row level security;
alter table private.vault_staged_payloads enable row level security;
alter table private.vault_records enable row level security;
alter table private.vault_wraps enable row level security;
alter table private.vault_keyrings enable row level security;
alter table private.vault_unlock_wraps enable row level security;
alter table private.vault_passkeys enable row level security;
alter table private.vault_audit_events enable row level security;

revoke all on table private.vault_genesis from public, anon, authenticated, service_role;
revoke all on table private.vault_key_log from public, anon, authenticated, service_role;
revoke all on table private.vault_staged_payloads from public, anon, authenticated, service_role;
revoke all on table private.vault_records from public, anon, authenticated, service_role;
revoke all on table private.vault_wraps from public, anon, authenticated, service_role;
revoke all on table private.vault_keyrings from public, anon, authenticated, service_role;
revoke all on table private.vault_unlock_wraps from public, anon, authenticated, service_role;
revoke all on table private.vault_passkeys from public, anon, authenticated, service_role;
revoke all on table private.vault_audit_events from public, anon, authenticated, service_role;
revoke all on sequence private.vault_audit_events_id_seq from public, anon, authenticated, service_role;

grant select, insert, update, delete on table private.vault_genesis to vault_definer;
grant select, insert, update, delete on table private.vault_key_log to vault_definer;
grant select, insert, update, delete on table private.vault_staged_payloads to vault_definer;
grant select, insert, update, delete on table private.vault_records to vault_definer;
grant select, insert, update, delete on table private.vault_wraps to vault_definer;
grant select, insert, update, delete on table private.vault_keyrings to vault_definer;
grant select, insert, update, delete on table private.vault_unlock_wraps to vault_definer;
grant select, insert, update, delete on table private.vault_passkeys to vault_definer;
grant select, insert, update, delete on table private.vault_audit_events to vault_definer;
create policy vault_genesis_definer on private.vault_genesis for all to vault_definer using (true) with check (true);
create policy vault_key_log_definer on private.vault_key_log for all to vault_definer using (true) with check (true);
create policy vault_staged_payloads_definer on private.vault_staged_payloads for all to vault_definer using (true) with check (true);
create policy vault_records_definer on private.vault_records for all to vault_definer using (true) with check (true);
create policy vault_wraps_definer on private.vault_wraps for all to vault_definer using (true) with check (true);
create policy vault_keyrings_definer on private.vault_keyrings for all to vault_definer using (true) with check (true);
create policy vault_unlock_wraps_definer on private.vault_unlock_wraps for all to vault_definer using (true) with check (true);
create policy vault_passkeys_definer on private.vault_passkeys for all to vault_definer using (true) with check (true);
create policy vault_audit_events_definer on private.vault_audit_events for all to vault_definer using (true) with check (true);
-- The key log, records, wraps, genesis and audit are append-only for the definer.
revoke update, delete on table private.vault_genesis from vault_definer;
revoke update, delete on table private.vault_key_log from vault_definer;
revoke update, delete on table private.vault_records from vault_definer;
revoke update, delete on table private.vault_wraps from vault_definer;
revoke update, delete on table private.vault_audit_events from vault_definer;
grant usage on sequence private.vault_audit_events_id_seq to vault_definer;

commit;
