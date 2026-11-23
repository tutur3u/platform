-- Calendar event guests, RSVP, invitation delivery and abuse controls.
--
-- The legacy participant model lives in the private schema
-- (20260711204734). This adds one guest row per event and email.
--
-- Access model: every table and function here is in the private schema and
-- reachable only by the service role. The Calendar API authorises
-- manage_calendar for the event's workspace before touching guests, and the
-- anonymous RSVP and unsubscribe pages resolve a hashed, purpose-bound,
-- expiring token on the server. RLS is enabled with no policies, so any role
-- other than the service role is denied.

-- ---------------------------------------------------------------------------
-- Per-event invitation settings (1:1 with workspace_calendar_events)
-- ---------------------------------------------------------------------------

create table private.calendar_event_invitation_settings (
  event_id uuid primary key
    references public.workspace_calendar_events (id) on delete cascade,
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  organizer_user_id uuid references public.users (id) on delete set null,
  guests_can_modify boolean not null default false,
  guests_can_invite_others boolean not null default true,
  guests_can_see_guest_list boolean not null default true,
  -- RFC 5545 identity. UID stays stable for the life of the event; SEQUENCE
  -- increments on every material change that is re-sent to guests.
  ical_uid text not null
    check (char_length(ical_uid) between 1 and 255),
  ical_sequence integer not null default 0 check (ical_sequence >= 0),
  -- Tuturuuu Meet link. meet_meeting_id references a workspace meeting when
  -- the room was created or linked through the scheduling surface.
  meet_meeting_id uuid references public.workspace_meetings (id)
    on delete set null,
  conference_url text
    check (
      conference_url is null
      or (
        char_length(conference_url) <= 2048
        and conference_url ~ '^https://'
      )
    ),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ical_uid)
);

create index calendar_event_invitation_settings_ws_idx
  on private.calendar_event_invitation_settings (ws_id);
create index calendar_event_invitation_settings_meeting_idx
  on private.calendar_event_invitation_settings (meet_meeting_id)
  where meet_meeting_id is not null;

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------

create table private.calendar_event_guests (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  event_id uuid not null
    references public.workspace_calendar_events (id) on delete cascade,
  email text not null
    check (
      char_length(email) between 3 and 320
      and email = lower(btrim(email))
      and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  display_name text check (display_name is null or char_length(display_name) <= 200),
  user_id uuid references public.users (id) on delete set null,
  contact_id uuid references public.workspace_users (id) on delete set null,
  source text not null default 'email'
    check (source in ('member', 'contact', 'email')),
  is_organizer boolean not null default false,
  is_optional boolean not null default false,
  rsvp_status text not null default 'pending'
    check (rsvp_status in ('pending', 'accepted', 'declined', 'tentative')),
  rsvp_comment text check (rsvp_comment is null or char_length(rsvp_comment) <= 500),
  responded_at timestamptz,
  invited_by uuid references public.users (id) on delete set null,
  last_invited_sequence integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email)
);

create index calendar_event_guests_event_idx
  on private.calendar_event_guests (event_id);
create index calendar_event_guests_user_idx
  on private.calendar_event_guests (user_id)
  where user_id is not null;
create index calendar_event_guests_ws_idx
  on private.calendar_event_guests (ws_id);
create unique index calendar_event_guests_one_organizer_idx
  on private.calendar_event_guests (event_id)
  where is_organizer;

-- Keep ws_id consistent with the parent event so RLS on ws_id is sound.
create or replace function private.calendar_guest_rows_match_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_ws uuid;
begin
  select ws_id into v_event_ws
  from public.workspace_calendar_events
  where id = new.event_id;

  if v_event_ws is null or v_event_ws <> new.ws_id then
    raise exception 'calendar invitation row workspace must match its event'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.calendar_guest_rows_match_event()
  from public, anon, authenticated;

create trigger calendar_event_guests_match_event
  before insert or update on private.calendar_event_guests
  for each row execute function private.calendar_guest_rows_match_event();

create trigger calendar_event_invitation_settings_match_event
  before insert or update on private.calendar_event_invitation_settings
  for each row execute function private.calendar_guest_rows_match_event();

-- A guest-specific cap keeps a single event from becoming a mass mailer.
create or replace function private.calendar_guest_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Serialise concurrent inserts for the same event.
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 7311));

  select count(*) into v_count
  from private.calendar_event_guests
  where event_id = new.event_id;

  if v_count >= 100 then
    raise exception 'calendar event guest limit reached'
      using errcode = '23514', hint = 'calendar_guest_limit';
  end if;

  return new;
end;
$$;

revoke all on function private.calendar_guest_cap()
  from public, anon, authenticated;

create trigger calendar_event_guests_cap
  before insert on private.calendar_event_guests
  for each row execute function private.calendar_guest_cap();

-- ---------------------------------------------------------------------------
-- Tokens, suppressions, delivery outbox and stop fence (service role only)
-- ---------------------------------------------------------------------------

create table private.calendar_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Unsubscribe links must outlive a removed guest or a deleted event, so
  -- the token keeps its own recipient and scope. An RSVP token is useless
  -- without its guest row and is resolved only through it.
  guest_id uuid
    references private.calendar_event_guests (id) on delete set null,
  email text not null check (email = lower(btrim(email))),
  ws_id uuid references public.workspaces (id) on delete cascade,
  sender_user_id uuid references public.users (id) on delete set null,
  purpose text not null check (purpose in ('rsvp', 'unsubscribe')),
  -- sha256 of the random token; the raw token exists only in the email.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index calendar_invite_tokens_guest_idx
  on private.calendar_invite_tokens (guest_id, purpose);

create table private.calendar_invite_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email))),
  -- 'all': no calendar invitations from Tuturuuu at all.
  -- 'sender': no invitations from one organizer.
  -- 'workspace': no invitations from one workspace.
  scope text not null check (scope in ('all', 'sender', 'workspace')),
  sender_user_id uuid references public.users (id) on delete cascade,
  ws_id uuid references public.workspaces (id) on delete cascade,
  source text not null default 'recipient'
    check (source in ('recipient', 'admin', 'bounce', 'complaint')),
  created_at timestamptz not null default now(),
  check (
    (scope = 'all' and sender_user_id is null and ws_id is null)
    or (scope = 'sender' and sender_user_id is not null)
    or (scope = 'workspace' and ws_id is not null)
  )
);

create unique index calendar_invite_suppressions_unique_idx
  on private.calendar_invite_suppressions (
    email,
    scope,
    coalesce(sender_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(ws_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table private.calendar_invite_deliveries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  event_id uuid references public.workspace_calendar_events (id)
    on delete set null,
  guest_id uuid references private.calendar_event_guests (id)
    on delete set null,
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email))),
  method text not null check (method in ('REQUEST', 'CANCEL')),
  kind text not null check (kind in ('invite', 'update', 'cancel')),
  ical_sequence integer not null check (ical_sequence >= 0),
  -- event + guest + sequence + method: a resend of the same version is a no-op.
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  requested_by uuid references public.users (id) on delete set null,
  -- Server-built copy of the event as it stood when the change was queued,
  -- so a cancellation still renders after the event row is deleted. Never
  -- client-supplied.
  event_snapshot jsonb not null default '{}'::jsonb
    check (octet_length(event_snapshot::text) <= 65536),
  status text not null default 'queued'
    check (
      status in (
        'queued', 'sending', 'sent', 'failed', 'suppressed',
        'throttled', 'cancelled', 'unknown'
      )
    ),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_invite_deliveries_due_idx
  on private.calendar_invite_deliveries (next_attempt_at)
  where status in ('queued', 'failed');
create index calendar_invite_deliveries_requester_idx
  on private.calendar_invite_deliveries (requested_by, created_at desc);
create index calendar_invite_deliveries_ws_idx
  on private.calendar_invite_deliveries (ws_id, created_at desc);
create index calendar_invite_deliveries_recipient_idx
  on private.calendar_invite_deliveries (recipient_email, created_at desc);
create index calendar_invite_deliveries_event_idx
  on private.calendar_invite_deliveries (event_id)
  where event_id is not null;

-- Durable stop fence. A row with ws_id null stops every workspace.
create table private.calendar_invite_send_fences (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid references public.workspaces (id) on delete cascade,
  stopped boolean not null default true,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index calendar_invite_send_fences_scope_idx
  on private.calendar_invite_send_fences (
    coalesce(ws_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Privacy-minimised audit trail (no tokens, no message bodies).
create table private.calendar_invite_audit (
  id bigint generated always as identity primary key,
  ws_id uuid references public.workspaces (id) on delete cascade,
  event_id uuid,
  guest_id uuid,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null check (
    action in (
      'guest_added', 'guest_removed', 'guest_updated', 'settings_updated',
      'invite_queued', 'invite_sent', 'invite_failed', 'invite_suppressed',
      'invite_throttled', 'invite_blocked_quota', 'invite_blocked_fence',
      'rsvp', 'unsubscribe', 'block_sender', 'event_cancelled'
    )
  ),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index calendar_invite_audit_ws_idx
  on private.calendar_invite_audit (ws_id, created_at desc);
create index calendar_invite_audit_event_idx
  on private.calendar_invite_audit (event_id, created_at desc)
  where event_id is not null;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'calendar_event_invitation_settings',
    'calendar_event_guests',
    'calendar_invite_tokens',
    'calendar_invite_suppressions',
    'calendar_invite_deliveries',
    'calendar_invite_send_fences',
    'calendar_invite_audit'
  ] loop
    execute format('alter table private.%I enable row level security', t);
    execute format(
      'revoke all on table private.%I from public, anon, authenticated', t
    );
    execute format('grant all on table private.%I to service_role', t);
  end loop;
end;
$$;

grant usage, select on all sequences in schema private to service_role;
