-- Meet room Mira host consent: durable evidence for host acceptances and each
-- participant's own Mira choice, plus the workspace default for the join tick
-- box. The meeting room Durable Object enforces consent at runtime; these
-- tables are the append-only record of who accepted, who chose what, and on
-- which notice.
--
-- Evidence rules (shared with private.meet_ai_consents): service role only,
-- append-only even for privileged UPDATE, RESTRICT on meeting or workspace
-- deletion, and Auth account deletion anonymizes the account reference.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_mira_host_acceptances (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null
    references public.workspace_meetings(id) on delete restrict,
  ws_id uuid not null references public.workspaces(id) on delete restrict,
  -- The host or co-host who accepted, or who ended the acceptance. Null after
  -- account deletion, or for an end not caused by an account (room restore).
  user_id uuid references public.users(id) on delete set null,
  revision integer not null check (revision > 0),
  event text not null check (event in ('accept', 'end')),
  end_reason text check (
    end_reason in ('turned_off', 'minor_reported', 'expanded', 'not_applied', 'restored')
  ),
  notice_version text not null check (length(notice_version) between 1 and 80),
  capabilities text[] not null default '{}' check (
    capabilities <@ array['chat', 'captions', 'notes']::text[]
  ),
  -- The acceptor confirmed the meeting audience is 18 or older.
  audience_adult_confirmed boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check ((event = 'accept') = (end_reason is null)),
  check (event <> 'accept' or audience_adult_confirmed),
  unique (meeting_id, revision, event)
);
create index meet_mira_host_acceptances_meeting
  on private.meet_mira_host_acceptances(meeting_id, revision desc);
create index meet_mira_host_acceptances_user
  on private.meet_mira_host_acceptances(user_id) where user_id is not null;

create table private.meet_mira_participant_choices (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null
    references public.workspace_meetings(id) on delete restrict,
  ws_id uuid not null references public.workspaces(id) on delete restrict,
  -- The acceptance current when the choice was made; null (revision 0) when
  -- none was current, which never counts as on.
  acceptance_id uuid
    references private.meet_mira_host_acceptances(id) on delete restrict,
  acceptance_revision integer not null check (acceptance_revision >= 0),
  user_id uuid references public.users(id) on delete set null,
  -- Accounts: a random per-meeting pseudonym minted on insert. Guests: the
  -- server-issued guest participant id, never a display label.
  participant_ref uuid not null,
  guest boolean not null default false,
  choice text not null check (choice in ('on', 'off')),
  source text not null check (source in ('join', 'confirm', 'toggle')),
  notice_version text not null check (length(notice_version) between 1 and 80),
  -- SHA-256 hex of the exact notice text shown, and its locale.
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz not null default clock_timestamp(),
  check (not guest or user_id is null),
  check ((acceptance_revision = 0) = (acceptance_id is null))
);
create index meet_mira_participant_choices_meeting
  on private.meet_mira_participant_choices(meeting_id, created_at desc, id desc);
create index meet_mira_participant_choices_user
  on private.meet_mira_participant_choices(user_id) where user_id is not null;
create index meet_mira_participant_choices_ref
  on private.meet_mira_participant_choices(meeting_id, participant_ref);

alter table private.meet_mira_host_acceptances enable row level security;
alter table private.meet_mira_participant_choices enable row level security;
revoke all on private.meet_mira_host_acceptances
  from public, anon, authenticated, service_role;
revoke all on private.meet_mira_participant_choices
  from public, anon, authenticated, service_role;
-- Only the trusted server appends evidence or deletes it for erasure.
grant select, insert, delete on private.meet_mira_host_acceptances to service_role;
grant select, insert, delete on private.meet_mira_participant_choices to service_role;

-- Immutable even for privileged UPDATE. The sole exception is the FK action
-- during account deletion, after the Auth or profile row is gone.
create function private.protect_meet_mira_evidence()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_setting('role', true) not in ('anon', 'authenticated')
    and pg_trigger_depth() > 1
    and old.user_id is not null and new.user_id is null
    and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id')
    and (not exists (select 1 from public.users where id = old.user_id)
      or not exists (select 1 from auth.users where id = old.user_id)) then
    return new;
  end if;
  raise exception 'Mira consent evidence is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.protect_meet_mira_evidence() from public, anon, authenticated;
grant execute on function private.protect_meet_mira_evidence() to service_role;
create trigger protect_meet_mira_host_acceptance
  before update on private.meet_mira_host_acceptances
  for each row execute function private.protect_meet_mira_evidence();
create trigger protect_meet_mira_participant_choice
  before update on private.meet_mira_participant_choices
  for each row execute function private.protect_meet_mira_evidence();

-- Server time orders evidence; a caller cannot backdate a row.
create function private.stamp_meet_mira_evidence()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.stamp_meet_mira_evidence() from public, anon, authenticated;
grant execute on function private.stamp_meet_mira_evidence() to service_role;
create trigger stamp_meet_mira_host_acceptance
  before insert on private.meet_mira_host_acceptances
  for each row execute function private.stamp_meet_mira_evidence();
create trigger stamp_meet_mira_participant_choice
  before insert on private.meet_mira_participant_choices
  for each row execute function private.stamp_meet_mira_evidence();

-- Auth deletion keeps a soft-deleted public profile, so anonymize at the Auth
-- boundary instead of waiting for the profile FK.
create function private.anonymize_meet_mira_evidence()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update private.meet_mira_host_acceptances set user_id = null where user_id = old.id;
  update private.meet_mira_participant_choices set user_id = null where user_id = old.id;
  return old;
end;
$$;
revoke all on function private.anonymize_meet_mira_evidence() from public, anon, authenticated;
grant execute on function private.anonymize_meet_mira_evidence() to service_role;
create trigger anonymize_meet_mira_evidence after delete on auth.users
  for each row execute function private.anonymize_meet_mira_evidence();

-- Allocates the next acceptance revision for a meeting and records the
-- acceptance. Serialized on the meeting row, so revisions stay monotonic
-- across room restores. The meeting room enforces who may accept; the server
-- calls this only after the room confirms the acceptor is present.
create function private.record_meet_mira_acceptance(
  p_meeting_id uuid,
  p_user_id uuid,
  p_notice_version text,
  p_capabilities text[]
) returns table (acceptance_id uuid, revision integer)
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  ws uuid;
  next_revision integer;
  new_id uuid;
begin
  if p_user_id is null then
    raise exception 'An acceptance names its acceptor' using errcode = '23514';
  end if;
  select m.ws_id into ws from public.workspace_meetings m
    where m.id = p_meeting_id for update;
  if ws is null then
    raise exception 'Meeting not found' using errcode = 'P0002';
  end if;
  select coalesce(max(a.revision), 0) + 1 into next_revision
    from private.meet_mira_host_acceptances a where a.meeting_id = p_meeting_id;
  insert into private.meet_mira_host_acceptances(
    meeting_id, ws_id, user_id, revision, event, notice_version,
    capabilities, audience_adult_confirmed
  ) values (
    p_meeting_id, ws, p_user_id, next_revision, 'accept', p_notice_version,
    coalesce(p_capabilities, '{}'), true
  ) returning id into new_id;
  return query select new_id, next_revision;
end;
$$;
revoke all on function private.record_meet_mira_acceptance(uuid, uuid, text, text[])
  from public, anon, authenticated;
grant execute on function private.record_meet_mira_acceptance(uuid, uuid, text, text[])
  to service_role;

-- Ends one acceptance revision once; repeated ends are no-ops.
create function private.end_meet_mira_acceptance(
  p_meeting_id uuid,
  p_revision integer,
  p_user_id uuid,
  p_reason text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  accepted private.meet_mira_host_acceptances;
begin
  perform 1 from public.workspace_meetings where id = p_meeting_id for update;
  select * into accepted from private.meet_mira_host_acceptances a
    where a.meeting_id = p_meeting_id and a.revision = p_revision
      and a.event = 'accept';
  if not found or exists (
    select 1 from private.meet_mira_host_acceptances a
      where a.meeting_id = p_meeting_id and a.revision = p_revision
        and a.event = 'end'
  ) then
    return false;
  end if;
  insert into private.meet_mira_host_acceptances(
    meeting_id, ws_id, user_id, revision, event, end_reason, notice_version,
    capabilities
  ) values (
    p_meeting_id, accepted.ws_id, p_user_id, p_revision, 'end', p_reason,
    accepted.notice_version, accepted.capabilities
  );
  return true;
end;
$$;
revoke all on function private.end_meet_mira_acceptance(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function private.end_meet_mira_acceptance(uuid, integer, uuid, text)
  to service_role;

-- Binds a choice to its acceptance row and pseudonymizes accounts. Guests
-- keep the server-issued guest id the caller supplies.
create function private.prepare_meet_mira_participant_choice()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing_ref uuid;
begin
  select m.ws_id into new.ws_id from public.workspace_meetings m
    where m.id = new.meeting_id for update;
  if new.acceptance_revision = 0 then
    new.acceptance_id := null;
  else
    select a.id into new.acceptance_id from private.meet_mira_host_acceptances a
      where a.meeting_id = new.meeting_id
        and a.revision = new.acceptance_revision and a.event = 'accept';
    if new.acceptance_id is null then
      raise exception 'Unknown Mira acceptance revision' using errcode = '23503';
    end if;
  end if;
  if new.guest then
    new.user_id := null;
  elsif new.user_id is not null then
    select c.participant_ref into existing_ref
      from private.meet_mira_participant_choices c
      where c.meeting_id = new.meeting_id and c.user_id = new.user_id
      order by c.created_at, c.id limit 1;
    new.participant_ref := coalesce(existing_ref, gen_random_uuid());
  else
    raise exception 'An account choice names its account' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_meet_mira_participant_choice()
  from public, anon, authenticated;
grant execute on function private.prepare_meet_mira_participant_choice() to service_role;
create trigger prepare_meet_mira_participant_choice
  before insert on private.meet_mira_participant_choices
  for each row execute function private.prepare_meet_mira_participant_choice();

-- Workspace default for the join tick box, as an append-only audit log; the
-- latest row wins and no row means ticked. The apps/web settings route checks
-- manage_workspace_settings and records the authenticated actor.
create table private.workspace_mira_consent_defaults (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  box_ticked boolean not null,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index workspace_mira_consent_defaults_latest
  on private.workspace_mira_consent_defaults(ws_id, created_at desc, id desc);
alter table private.workspace_mira_consent_defaults enable row level security;
revoke all on private.workspace_mira_consent_defaults
  from public, anon, authenticated, service_role;
grant select, insert on private.workspace_mira_consent_defaults to service_role;
create trigger stamp_workspace_mira_consent_default
  before insert on private.workspace_mira_consent_defaults
  for each row execute function private.stamp_meet_mira_evidence();

-- Transcript consent pseudonyms: a guest reuses only an already minted
-- session reference, never another guest's reference by display label, so two
-- guests with the same name always get separate decisions. Labels are not
-- retained.
create or replace function private.prepare_meet_ai_consent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing_ref uuid;
begin
  perform 1 from public.meet_ai_sessions where id = new.session_id for update;
  new.guest_label := null;
  if new.user_id is not null then
    select c.participant_ref into existing_ref from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id = new.user_id
      order by c.created_at, c.id limit 1;
  else
    select c.participant_ref into existing_ref from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id is null
        and c.participant_ref = new.participant_ref
      limit 1;
  end if;
  new.participant_ref := coalesce(existing_ref, gen_random_uuid());
  return new;
end;
$$;
revoke all on function private.prepare_meet_ai_consent() from public, anon, authenticated;
grant execute on function private.prepare_meet_ai_consent() to service_role;

commit;
