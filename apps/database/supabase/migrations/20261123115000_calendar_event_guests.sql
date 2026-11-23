-- Calendar event guests, RSVP, invitation delivery and abuse controls.
--
-- The legacy participant model was retired to the private schema
-- (20260711204734). This replaces it with one guest row per event and email.
--
-- Access model
-- * Calendar managers of the event's workspace (manage_calendar) manage
--   guests, settings and see delivery state.
-- * A platform user who is a guest can read their own guest row and answer it
--   through calendar_respond_to_event. Other guests are visible to them only
--   through calendar_list_event_guests_for_guest, which honours the event's
--   "guests can see the guest list" setting.
-- * Anonymous recipients never touch these tables. One-click RSVP and
--   unsubscribe links resolve through server routes that use the service role
--   with a hashed, purpose-bound, expiring token.
-- * Token, suppression, delivery and fence tables are service-role only.

-- ---------------------------------------------------------------------------
-- Per-event invitation settings (1:1 with workspace_calendar_events)
-- ---------------------------------------------------------------------------

create table public.calendar_event_invitation_settings (
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
  on public.calendar_event_invitation_settings (ws_id);
create index calendar_event_invitation_settings_meeting_idx
  on public.calendar_event_invitation_settings (meet_meeting_id)
  where meet_meeting_id is not null;

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------

create table public.calendar_event_guests (
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
  on public.calendar_event_guests (event_id);
create index calendar_event_guests_user_idx
  on public.calendar_event_guests (user_id)
  where user_id is not null;
create index calendar_event_guests_ws_idx
  on public.calendar_event_guests (ws_id);
create unique index calendar_event_guests_one_organizer_idx
  on public.calendar_event_guests (event_id)
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
  before insert or update on public.calendar_event_guests
  for each row execute function private.calendar_guest_rows_match_event();

create trigger calendar_event_invitation_settings_match_event
  before insert or update on public.calendar_event_invitation_settings
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
  from public.calendar_event_guests
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
  before insert on public.calendar_event_guests
  for each row execute function private.calendar_guest_cap();

-- ---------------------------------------------------------------------------
-- Tokens, suppressions, delivery outbox and stop fence (service role only)
-- ---------------------------------------------------------------------------

create table public.calendar_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null
    references public.calendar_event_guests (id) on delete cascade,
  purpose text not null check (purpose in ('rsvp', 'unsubscribe')),
  -- sha256 of the random token; the raw token exists only in the email.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index calendar_invite_tokens_guest_idx
  on public.calendar_invite_tokens (guest_id, purpose);

create table public.calendar_invite_suppressions (
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
  on public.calendar_invite_suppressions (
    email,
    scope,
    coalesce(sender_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(ws_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table public.calendar_invite_deliveries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  event_id uuid references public.workspace_calendar_events (id)
    on delete set null,
  guest_id uuid references public.calendar_event_guests (id)
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
  on public.calendar_invite_deliveries (next_attempt_at)
  where status in ('queued', 'failed');
create index calendar_invite_deliveries_requester_idx
  on public.calendar_invite_deliveries (requested_by, created_at desc);
create index calendar_invite_deliveries_ws_idx
  on public.calendar_invite_deliveries (ws_id, created_at desc);
create index calendar_invite_deliveries_recipient_idx
  on public.calendar_invite_deliveries (recipient_email, created_at desc);
create index calendar_invite_deliveries_event_idx
  on public.calendar_invite_deliveries (event_id)
  where event_id is not null;

-- Durable stop fence. A row with ws_id null stops every workspace.
create table public.calendar_invite_send_fences (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid references public.workspaces (id) on delete cascade,
  stopped boolean not null default true,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index calendar_invite_send_fences_scope_idx
  on public.calendar_invite_send_fences (
    coalesce(ws_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Privacy-minimised audit trail (no tokens, no message bodies).
create table public.calendar_invite_audit (
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
  on public.calendar_invite_audit (ws_id, created_at desc);
create index calendar_invite_audit_event_idx
  on public.calendar_invite_audit (event_id, created_at desc)
  where event_id is not null;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

alter table public.calendar_event_invitation_settings enable row level security;
alter table public.calendar_event_guests enable row level security;
alter table public.calendar_invite_tokens enable row level security;
alter table public.calendar_invite_suppressions enable row level security;
alter table public.calendar_invite_deliveries enable row level security;
alter table public.calendar_invite_send_fences enable row level security;
alter table public.calendar_invite_audit enable row level security;

revoke all on table
  public.calendar_invite_tokens,
  public.calendar_invite_suppressions,
  public.calendar_invite_deliveries,
  public.calendar_invite_send_fences,
  public.calendar_invite_audit
from public, anon, authenticated;

grant all on table
  public.calendar_invite_tokens,
  public.calendar_invite_suppressions,
  public.calendar_invite_deliveries,
  public.calendar_invite_send_fences,
  public.calendar_invite_audit
to service_role;

-- Like workspace_calendar_events, guest tables are proxy-only: the calendar
-- API authorises the caller and uses the service role. The policies below are
-- retained defence in depth for any future direct grant.
revoke all on table
  public.calendar_event_invitation_settings,
  public.calendar_event_guests
from public, anon, authenticated;

grant all on table
  public.calendar_event_invitation_settings,
  public.calendar_event_guests
to service_role;

create policy account_required_mfa
  on public.calendar_event_invitation_settings
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_event_guests
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_invite_tokens
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_invite_suppressions
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_invite_deliveries
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_invite_send_fences
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create policy account_required_mfa
  on public.calendar_invite_audit
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

-- Mirrors the workspace_calendar_events policies (20260903083000). Lives in
-- public because authenticated has no usage on the private schema.
create or replace function public.calendar_is_workspace_calendar_manager(
  p_ws_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_members.ws_id = p_ws_id
      and workspace_members.user_id = (select auth.uid())
  )
  and public.has_workspace_permission(
    p_ws_id, (select auth.uid()), 'manage_calendar'
  );
$$;

revoke all on function public.calendar_is_workspace_calendar_manager(uuid)
  from public, anon;
grant execute on function public.calendar_is_workspace_calendar_manager(uuid)
  to authenticated, service_role;

create policy "Calendar managers can read invitation settings"
  on public.calendar_event_invitation_settings
  for select to authenticated
  using ((select public.calendar_is_workspace_calendar_manager(ws_id)));

create policy "Guests can read invitation settings of their events"
  on public.calendar_event_invitation_settings
  for select to authenticated
  using (
    exists (
      select 1
      from public.calendar_event_guests g
      where g.event_id = calendar_event_invitation_settings.event_id
        and g.user_id = (select auth.uid())
    )
  );

create policy "Calendar managers can write invitation settings"
  on public.calendar_event_invitation_settings
  for all to authenticated
  using ((select public.calendar_is_workspace_calendar_manager(ws_id)))
  with check ((select public.calendar_is_workspace_calendar_manager(ws_id)));

create policy "Calendar managers can read guests"
  on public.calendar_event_guests
  for select to authenticated
  using ((select public.calendar_is_workspace_calendar_manager(ws_id)));

create policy "Guests can read their own guest row"
  on public.calendar_event_guests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Calendar managers can add guests"
  on public.calendar_event_guests
  for insert to authenticated
  with check ((select public.calendar_is_workspace_calendar_manager(ws_id)));

create policy "Calendar managers can update guests"
  on public.calendar_event_guests
  for update to authenticated
  using ((select public.calendar_is_workspace_calendar_manager(ws_id)))
  with check ((select public.calendar_is_workspace_calendar_manager(ws_id)));

create policy "Calendar managers can remove guests"
  on public.calendar_event_guests
  for delete to authenticated
  using ((select public.calendar_is_workspace_calendar_manager(ws_id)));

-- ---------------------------------------------------------------------------
-- Guest-facing RPCs
-- ---------------------------------------------------------------------------

-- A signed-in guest answers their own invitation.
create or replace function public.calendar_respond_to_event(
  p_event_id uuid,
  p_status text,
  p_comment text default null
)
returns public.calendar_event_guests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.calendar_event_guests;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.account_required_mfa_satisfied() then
    raise exception 'multi-factor authentication required'
      using errcode = '42501';
  end if;

  if p_status not in ('accepted', 'declined', 'tentative') then
    raise exception 'invalid RSVP status' using errcode = '22023';
  end if;

  if p_comment is not null and char_length(p_comment) > 500 then
    raise exception 'RSVP comment too long' using errcode = '22001';
  end if;

  update public.calendar_event_guests
  set rsvp_status = p_status,
      rsvp_comment = nullif(btrim(p_comment), ''),
      responded_at = now()
  where event_id = p_event_id
    and user_id = v_uid
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not a guest of this event' using errcode = '42501';
  end if;

  insert into public.calendar_invite_audit (
    ws_id, event_id, guest_id, actor_user_id, action, detail
  ) values (
    v_row.ws_id, v_row.event_id, v_row.id, v_uid, 'rsvp',
    jsonb_build_object('status', p_status, 'channel', 'app')
  );

  return v_row;
end;
$$;

revoke all on function public.calendar_respond_to_event(uuid, text, text)
  from public, anon;
grant execute on function public.calendar_respond_to_event(uuid, text, text)
  to authenticated, service_role;

-- A signed-in guest lists the guests they are allowed to see.
create or replace function public.calendar_list_event_guests_for_guest(
  p_event_id uuid
)
returns table (
  id uuid,
  email text,
  display_name text,
  is_organizer boolean,
  is_optional boolean,
  rsvp_status text,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_can_see boolean;
begin
  if v_uid is not null and not public.account_required_mfa_satisfied() then
    raise exception 'multi-factor authentication required'
      using errcode = '42501';
  end if;

  if v_uid is null or not exists (
    select 1 from public.calendar_event_guests g
    where g.event_id = p_event_id and g.user_id = v_uid
  ) then
    raise exception 'not a guest of this event' using errcode = '42501';
  end if;

  select coalesce(s.guests_can_see_guest_list, true) into v_can_see
  from public.calendar_event_invitation_settings s
  where s.event_id = p_event_id;

  return query
  select g.id, g.email, g.display_name, g.is_organizer, g.is_optional,
         g.rsvp_status, g.user_id = v_uid
  from public.calendar_event_guests g
  where g.event_id = p_event_id
    and (
      coalesce(v_can_see, true)
      or g.user_id = v_uid
      or g.is_organizer
    )
  order by g.is_organizer desc, g.created_at;
end;
$$;

revoke all on function public.calendar_list_event_guests_for_guest(uuid)
  from public, anon;
grant execute on function public.calendar_list_event_guests_for_guest(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Durable send quota (service role). Counts the outbox, which is the durable
-- counter; returns the first exceeded limit or null.
-- ---------------------------------------------------------------------------

create or replace function public.calendar_invite_quota_check(
  p_ws_id uuid,
  p_requested_by uuid,
  p_new_recipients integer,
  p_user_daily_limit integer default 200,
  p_workspace_daily_limit integer default 1000,
  p_user_hourly_limit integer default 60
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_day integer;
  v_user_hour integer;
  v_ws_day integer;
begin
  if exists (
    select 1 from public.calendar_invite_send_fences f
    where f.stopped and (f.ws_id is null or f.ws_id = p_ws_id)
  ) then
    return 'stopped';
  end if;

  select count(*) filter (where created_at > now() - interval '1 day'),
         count(*) filter (where created_at > now() - interval '1 hour')
  into v_user_day, v_user_hour
  from public.calendar_invite_deliveries
  where requested_by = p_requested_by
    and created_at > now() - interval '1 day'
    and status not in ('suppressed', 'throttled', 'cancelled');

  if v_user_hour + p_new_recipients > p_user_hourly_limit then
    return 'user_hourly';
  end if;

  if v_user_day + p_new_recipients > p_user_daily_limit then
    return 'user_daily';
  end if;

  select count(*) into v_ws_day
  from public.calendar_invite_deliveries
  where ws_id = p_ws_id
    and created_at > now() - interval '1 day'
    and status not in ('suppressed', 'throttled', 'cancelled');

  if v_ws_day + p_new_recipients > p_workspace_daily_limit then
    return 'workspace_daily';
  end if;

  return null;
end;
$$;

revoke all on function public.calendar_invite_quota_check(
  uuid, uuid, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.calendar_invite_quota_check(
  uuid, uuid, integer, integer, integer, integer
) to service_role;

-- Claim a bounded batch of due deliveries with a lease (service role).
create or replace function public.calendar_invite_claim_deliveries(
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.calendar_invite_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'claim limit out of range' using errcode = '22023';
  end if;

  -- A lease that expired mid-send may already have reached the provider.
  -- Settle it as unknown instead of sending a possible duplicate.
  update public.calendar_invite_deliveries
  set status = 'unknown',
      last_error = 'send lease expired',
      lease_expires_at = null,
      updated_at = now()
  where status = 'sending'
    and lease_expires_at < now();

  return query
  update public.calendar_invite_deliveries d
  set status = 'sending',
      attempts = d.attempts + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where d.id in (
    select c.id
    from public.calendar_invite_deliveries c
    where c.status in ('queued', 'failed')
      and c.next_attempt_at <= now()
      and c.attempts < 5
      and not exists (
        select 1 from public.calendar_invite_send_fences f
        where f.stopped and (f.ws_id is null or f.ws_id = c.ws_id)
      )
    order by c.next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning d.*;
end;
$$;

revoke all on function public.calendar_invite_claim_deliveries(integer, integer)
  from public, anon, authenticated;
grant execute on function public.calendar_invite_claim_deliveries(integer, integer)
  to service_role;

-- Check quotas and queue deliveries in one transaction. Advisory locks on
-- the requester and the workspace serialise concurrent requests, so
-- parallel sends cannot all pass the same quota snapshot (service role).
create or replace function public.calendar_invite_enqueue(
  p_ws_id uuid,
  p_requested_by uuid,
  p_rows jsonb,
  p_new_recipients integer,
  p_check_quota boolean,
  p_user_daily_limit integer default 200,
  p_workspace_daily_limit integer default 1000,
  p_user_hourly_limit integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked text;
  v_rows jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 101 then
    raise exception 'invalid delivery batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requested_by::text, 7312));
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 7313));

  if p_check_quota then
    v_blocked := public.calendar_invite_quota_check(
      p_ws_id, p_requested_by, p_new_recipients,
      p_user_daily_limit, p_workspace_daily_limit, p_user_hourly_limit
    );
    if v_blocked is not null then
      return jsonb_build_object('blocked', v_blocked, 'rows', '[]'::jsonb);
    end if;
  end if;

  with inserted as (
    insert into public.calendar_invite_deliveries (
      ws_id, event_id, guest_id, recipient_email, method, kind,
      ical_sequence, idempotency_key, requested_by, event_snapshot, status
    )
    select p_ws_id, r.event_id, r.guest_id, r.recipient_email, r.method,
           r.kind, r.ical_sequence, r.idempotency_key, p_requested_by,
           r.event_snapshot, r.status
    from jsonb_to_recordset(p_rows) as r (
      event_id uuid, guest_id uuid, recipient_email text, method text,
      kind text, ical_sequence integer, idempotency_key text,
      event_snapshot jsonb, status text
    )
    where r.status in ('queued', 'suppressed', 'throttled')
    on conflict (idempotency_key) do nothing
    returning id, guest_id, status
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
  into v_rows
  from inserted;

  return jsonb_build_object('blocked', null, 'rows', v_rows);
end;
$$;

revoke all on function public.calendar_invite_enqueue(
  uuid, uuid, jsonb, integer, boolean, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.calendar_invite_enqueue(
  uuid, uuid, jsonb, integer, boolean, integer, integer, integer
) to service_role;
