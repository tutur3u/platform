begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_erase_settings (
  singleton boolean primary key default true check (singleton),
  erasure_log_retention interval not null default interval '3 years' check (erasure_log_retention > interval '0'),
  request_retention interval not null default interval '1 year' check (request_retention > interval '0'),
  issuance_retention interval not null default interval '30 days' check (issuance_retention > interval '0'),
  ledger_retention interval check (ledger_retention > interval '0'),
  locator_retention interval check (locator_retention > interval '0'),
  legacy_audio_retention interval check (legacy_audio_retention > interval '0'),
  retention_purge_enabled boolean not null default false
);
insert into private.meet_erase_settings default values;
create table private.meet_erase_settings_audit (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by text not null,
  old_settings jsonb not null,
  new_settings jsonb not null
);
create function private.audit_meet_erase_settings() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into private.meet_erase_settings_audit(changed_by,old_settings,new_settings)
    values (session_user, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
create trigger meet_erase_settings_audit after update on private.meet_erase_settings
for each row when (old.* is distinct from new.*) execute function private.audit_meet_erase_settings();

create table private.meet_content_holds (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete restrict,
  meeting_id uuid,
  kind text not null check (kind in ('legal_hold','retention_lock')),
  hold_ref text not null check (length(trim(hold_ref)) between 1 and 256),
  cora_approval_ref text not null check (length(trim(cora_approval_ref)) between 1 and 256),
  review_by timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  check (review_by > created_at),
  check (released_at is null or released_at >= created_at)
);
create index meet_content_holds_active on private.meet_content_holds(ws_id,meeting_id) where released_at is null;
-- V9 must replace this guard with ledger-backed, serialized transitions.
create function private.block_meet_hold_transition() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception using errcode = '55000', message = 'Meet hold transitions require the independent ledger';
end;
$$;
create trigger meet_hold_transition_inert before insert or update or delete on private.meet_content_holds
for each row execute function private.block_meet_hold_transition();
create trigger meet_hold_truncate_inert before truncate on private.meet_content_holds
for each statement execute function private.block_meet_hold_transition();

alter table private.meet_erase_settings enable row level security;
alter table private.meet_erase_settings_audit enable row level security;
alter table private.meet_content_holds enable row level security;
revoke all on private.meet_erase_settings, private.meet_erase_settings_audit, private.meet_content_holds from public, anon, authenticated, service_role;
grant select, update on private.meet_erase_settings to service_role;
grant select on private.meet_erase_settings_audit, private.meet_content_holds to service_role;
revoke all on function private.audit_meet_erase_settings(), private.block_meet_hold_transition() from public, anon, authenticated, service_role;
commit;
