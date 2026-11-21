-- People registry storage. Tables stay private with no client or service-role
-- privileges; registry definer functions reach them as people_registry_definer
-- through policies scoped to that role only.
-- tuturuuu: no-grant (internal)
begin;
set local lock_timeout = '3s';

create role people_registry_definer nologin noinherit nocreaterole nocreatedb nobypassrls;
grant usage on schema private to people_registry_definer;
grant people_registry_definer to postgres;

create type private.people_channel as enum ('zalo', 'whatsapp', 'discord', 'email', 'phone');
create type private.people_person_kind as enum ('person', 'organisation');
create type private.people_subject_status as enum ('active', 'merged', 'deleting', 'deleted');
create type private.people_verification as enum ('asserted', 'desk_observed', 'code_verified');
create type private.people_link_state as enum ('proposed', 'confirmed', 'rejected');
create type private.people_link_basis as enum (
  'owner_statement', 'self_introduction', 'same_phone', 'same_name', 'migration', 'fleet_verified'
);
create type private.people_conversation_kind as enum ('dm', 'group');
create type private.people_relationship_kind as enum (
  'owner', 'family', 'partner', 'friend', 'colleague', 'manager', 'report',
  'client', 'vendor', 'member_of', 'other'
);
create type private.people_rule_scope as enum ('channel_default', 'conversation', 'person');
create type private.people_rule as enum (
  'addressed_response', 'group_response', 'reply_mode', 'owner_instructions',
  'mention_sender', 'quiet_hours', 'quiet_hours_bypass', 'hold_topics',
  'hold_action', 'initiate', 'escalate'
);
create type private.people_consent_store as enum ('profile', 'memory', 'capture');
create type private.people_consent_state as enum ('granted', 'unknown', 'denied', 'revoked', 'expired');
create type private.people_consent_basis as enum ('subject_given', 'owner_attested', 'imported');
create type private.people_change_kind as enum ('update', 'revoke', 'delete');
create type private.people_key_purpose as enum ('sender_lookup', 'conversation_lookup', 'suppression', 'display', 'audit');
create type private.people_audience as enum ('origin', 'subject_conversations', 'listed');

create table private.people_registry_control (
  ws_id uuid primary key references public.workspaces (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  capture_enabled boolean not null default false,
  personal_sessions_enabled boolean not null default false,
  stopped boolean not null default false,
  generation bigint not null default 1 check (generation > 0),
  created_at timestamptz not null default now()
);

-- Random per-workspace key material, wrapped by PEOPLE_REGISTRY_WRAP_KEY in the
-- API. Deleting a workspace deletes these rows, which makes its hashes and
-- ciphertexts unrecoverable.
create table private.people_workspace_keys (
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  purpose private.people_key_purpose not null,
  version smallint not null check (version > 0),
  wrapped_key bytea not null check (octet_length(wrapped_key) between 44 and 128),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (ws_id, purpose, version)
);
create unique index people_workspace_keys_current on private.people_workspace_keys (ws_id, purpose)
  where retired_at is null;

create table private.people_registry_managers (
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid not null,
  added_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (ws_id, user_id)
);

create table private.people_channel_bindings (
  channel private.people_channel not null check (channel in ('zalo', 'whatsapp', 'discord')),
  provider_account_id text not null check (provider_account_id ~ '^[!-~]{1,200}$'),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  added_by uuid not null,
  added_at timestamptz not null default now(),
  primary key (channel, provider_account_id)
);
create index people_channel_bindings_ws on private.people_channel_bindings (ws_id);

create table private.people_persons (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  kind private.people_person_kind not null default 'person',
  label text not null check (length(btrim(label)) between 1 and 200),
  status private.people_subject_status not null default 'active',
  merged_into uuid,
  contact_id uuid,
  linked_user_id uuid references auth.users (id) on delete set null,
  is_owner boolean not null default false,
  version bigint not null default 1 check (version > 0),
  consent_version bigint not null default 1 check (consent_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (id),
  foreign key (ws_id, merged_into) references private.people_persons (ws_id, id),
  foreign key (ws_id, contact_id) references public.workspace_users (ws_id, id) on delete set null (contact_id),
  check ((status = 'merged') = (merged_into is not null)),
  check (merged_into is distinct from id)
);
create unique index people_persons_one_owner on private.people_persons (ws_id) where is_owner;
create unique index people_persons_contact on private.people_persons (ws_id, contact_id)
  where contact_id is not null and status = 'active';
create index people_persons_linked_user on private.people_persons (linked_user_id) where linked_user_id is not null;
create index people_persons_label on private.people_persons (ws_id, lower(label));

create table private.people_channel_identities (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null,
  person_id uuid not null,
  channel private.people_channel not null,
  provider_account_id text not null check (provider_account_id ~ '^[!-~]{1,200}$'),
  lookup_hash bytea not null check (octet_length(lookup_hash) = 32),
  key_version smallint not null check (key_version > 0),
  suppression_token bytea not null check (octet_length(suppression_token) = 32),
  suppression_key_version smallint not null check (suppression_key_version > 0),
  display_ciphertext bytea check (octet_length(display_ciphertext) <= 1024),
  verification private.people_verification not null,
  link_state private.people_link_state not null default 'proposed',
  basis private.people_link_basis not null,
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  evidence_ref text check (length(evidence_ref) <= 200),
  created_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (ws_id, person_id, channel, provider_account_id, lookup_hash),
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  check (basis <> 'same_name' or link_state <> 'confirmed'),
  check ((link_state = 'proposed') = (decided_at is null))
);
create unique index people_identities_one_confirmed on private.people_channel_identities
  (ws_id, channel, provider_account_id, lookup_hash) where link_state = 'confirmed';

create table private.people_conversations (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  channel private.people_channel not null check (channel in ('zalo', 'whatsapp', 'discord')),
  provider_account_id text not null check (provider_account_id ~ '^[!-~]{1,200}$'),
  lookup_hash bytea not null check (octet_length(lookup_hash) = 32),
  key_version smallint not null check (key_version > 0),
  kind private.people_conversation_kind not null,
  label_ciphertext bytea check (octet_length(label_ciphertext) <= 1024),
  status private.people_subject_status not null default 'active' check (status <> 'merged'),
  version bigint not null default 1 check (version > 0),
  consent_version bigint not null default 1 check (consent_version > 0),
  created_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (id),
  unique (ws_id, channel, provider_account_id, lookup_hash)
);

create table private.people_conversation_members (
  ws_id uuid not null,
  conversation_id uuid not null,
  person_id uuid not null,
  identity_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (ws_id, conversation_id, person_id),
  foreign key (ws_id, conversation_id) references private.people_conversations (ws_id, id) on delete cascade,
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, identity_id) references private.people_channel_identities (ws_id, id) on delete cascade
);
create index people_conversation_members_person on private.people_conversation_members (ws_id, person_id);

create table private.people_relationships (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null,
  from_person_id uuid not null,
  to_person_id uuid not null,
  kind private.people_relationship_kind not null,
  label text check (length(label) <= 80),
  confidence numeric(3, 2) not null default 1 check (confidence between 0 and 1),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and octet_length(provenance::text) <= 2048),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (ws_id, from_person_id, to_person_id, kind),
  foreign key (ws_id, from_person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, to_person_id) references private.people_persons (ws_id, id) on delete cascade,
  check (from_person_id <> to_person_id)
);
create index people_relationships_to on private.people_relationships (ws_id, to_person_id);

create table private.people_facts (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null,
  person_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  value text not null check (length(btrim(value)) between 1 and 2000),
  owner_entered boolean not null,
  origin_conversation_id uuid,
  audience private.people_audience not null default 'origin',
  audience_conversation_ids uuid[] not null default '{}' check (cardinality(audience_conversation_ids) <= 50),
  owner_dm boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and octet_length(provenance::text) <= 2048),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (ws_id, person_id, key),
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, origin_conversation_id) references private.people_conversations (ws_id, id)
    on delete set null (origin_conversation_id),
  check (audience <> 'origin' or origin_conversation_id is not null or owner_entered),
  check ((audience = 'listed') = (cardinality(audience_conversation_ids) > 0))
);

create table private.people_briefs (
  ws_id uuid not null,
  person_id uuid,
  conversation_id uuid,
  body text not null check (length(btrim(body)) between 1 and 4000),
  cited_ids uuid[] not null default '{}' check (cardinality(cited_ids) <= 200),
  consent_version bigint not null check (consent_version > 0),
  revision bigint not null default 1 check (revision > 0),
  built_at timestamptz not null default now(),
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, conversation_id) references private.people_conversations (ws_id, id) on delete cascade,
  check ((person_id is null) <> (conversation_id is null))
);
create unique index people_briefs_person on private.people_briefs (ws_id, person_id) where person_id is not null;
create unique index people_briefs_conversation on private.people_briefs (ws_id, conversation_id) where conversation_id is not null;

create table private.people_rules (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  scope private.people_rule_scope not null,
  channel private.people_channel,
  person_id uuid,
  conversation_id uuid,
  rule private.people_rule not null,
  value jsonb not null check (octet_length(value::text) <= 1024),
  expires_at timestamptz,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and octet_length(provenance::text) <= 2048),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (ws_id, id),
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, conversation_id) references private.people_conversations (ws_id, id) on delete cascade,
  check (
    (scope = 'channel_default' and channel is not null and person_id is null and conversation_id is null)
    or (scope = 'conversation' and conversation_id is not null and person_id is null)
    or (scope = 'person' and person_id is not null and conversation_id is null)
  )
);
alter table private.people_rules add constraint people_rules_unique
  unique nulls not distinct (ws_id, scope, channel, person_id, conversation_id, rule);

create table private.people_consents (
  ws_id uuid not null,
  person_id uuid,
  conversation_id uuid,
  store private.people_consent_store not null,
  state private.people_consent_state not null,
  basis private.people_consent_basis,
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 2048),
  scope jsonb not null default '{}' check (jsonb_typeof(scope) = 'object' and octet_length(scope::text) <= 1024),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete cascade,
  foreign key (ws_id, conversation_id) references private.people_conversations (ws_id, id) on delete cascade,
  check ((person_id is null) <> (conversation_id is null)),
  check (state = 'unknown' or basis is not null)
);
create unique index people_consents_person on private.people_consents (ws_id, person_id, store) where person_id is not null;
create unique index people_consents_conversation on private.people_consents (ws_id, conversation_id, store)
  where conversation_id is not null;

create table private.people_suppressions (
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  token bytea not null check (octet_length(token) = 32),
  key_version smallint not null check (key_version > 0),
  deleted_at timestamptz not null default now(),
  primary key (ws_id, token, key_version)
);

create table private.people_change_events (
  event_id bigint generated always as identity primary key,
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  person_id uuid,
  conversation_id uuid,
  version bigint not null check (version > 0),
  consent_version bigint not null check (consent_version > 0),
  kind private.people_change_kind not null,
  created_at timestamptz not null default now(),
  check ((person_id is null) <> (conversation_id is null))
);
create index people_change_events_ws on private.people_change_events (ws_id, event_id);

create table private.people_audit_events (
  id bigint generated always as identity primary key,
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  actor_user_id uuid,
  principal_id uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{0,63}$'),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  purpose text check (purpose in ('reply', 'brief', 'fleet', 'import', 'manage')),
  conversation_id uuid,
  record_ids uuid[] not null default '{}' check (cardinality(record_ids) <= 100),
  created_at timestamptz not null default now(),
  check (actor_user_id is not null or principal_id is not null or reason_code like 'refused_%')
);
create index people_audit_events_ws on private.people_audit_events (ws_id, created_at desc);
create index people_audit_events_records on private.people_audit_events using gin (record_ids);

-- tuturuuu: no-grant (trigger)
create function private.people_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from private.people_registry_control c where c.ws_id = old.ws_id
  ) then
    return old;
  end if;
  raise exception 'People audit events are append-only' using errcode = '55000';
end;
$$;
revoke all on function private.people_reject_audit_mutation() from public, anon, authenticated, service_role;

create trigger people_audit_append_only
before update or delete on private.people_audit_events
for each row execute function private.people_reject_audit_mutation();

-- tuturuuu: no-grant (trigger)
create function private.people_reject_audit_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'People audit events are append-only' using errcode = '55000';
end;
$$;
revoke all on function private.people_reject_audit_truncate() from public, anon, authenticated, service_role;

create trigger people_audit_no_truncate
before truncate on private.people_audit_events
for each statement execute function private.people_reject_audit_truncate();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'people_registry_control', 'people_workspace_keys', 'people_registry_managers', 'people_channel_bindings',
    'people_persons', 'people_channel_identities', 'people_conversations',
    'people_conversation_members', 'people_relationships', 'people_facts',
    'people_briefs', 'people_rules', 'people_consents', 'people_suppressions',
    'people_change_events', 'people_audit_events'
  ] loop
    execute format('alter table private.%I enable row level security', v_table);
    execute format('revoke all on table private.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select, insert, update, delete on table private.%I to people_registry_definer', v_table);
    execute format(
      'create policy %I on private.%I for all to people_registry_definer using (true) with check (true)',
      v_table || '_definer', v_table
    );
  end loop;
end;
$$;

revoke update, delete on table private.people_audit_events from people_registry_definer;
revoke all on sequence private.people_change_events_event_id_seq, private.people_audit_events_id_seq
  from public, anon, authenticated, service_role;
grant usage on sequence private.people_change_events_event_id_seq, private.people_audit_events_id_seq
  to people_registry_definer;

commit;
