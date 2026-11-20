begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- One row per (erasure intent, room). Cron Control claims a bounded page of
-- unacknowledged rooms, erases each room copy through the Meet realtime
-- entrypoint, and records the acknowledgement here. A plan of any size is
-- worked in pages; no single row holds the whole room list's progress.
create table private.meet_attendance_erasure_rooms (
  kind text not null,
  subject_key text not null,
  room_id text not null,
  ws_id uuid not null,
  meeting_id uuid not null,
  generation bigint,
  claim_keys text[] not null,
  acked_keys text[] not null default '{}'::text[],
  attempts integer not null default 0,
  lease_until timestamptz,
  primary key (kind, subject_key, room_id),
  foreign key (kind, subject_key)
    references private.meet_attendance_pending_erasures (kind, subject_key)
    on delete cascade,
  constraint meet_attendance_erasure_rooms_generation
    check (generation is null or generation >= 1),
  constraint meet_attendance_erasure_rooms_claims
    check (pg_catalog.cardinality(claim_keys) between 1 and 3)
);

comment on table private.meet_attendance_erasure_rooms is
  'Per-room acknowledgements for a confirmed Meet attendance erasure. Rows go with their intent.';

create index meet_attendance_erasure_rooms_due
  on private.meet_attendance_erasure_rooms (lease_until nulls first, kind, subject_key, room_id);

alter table private.meet_attendance_erasure_rooms enable row level security;
revoke all on table private.meet_attendance_erasure_rooms
  from public, anon, authenticated, service_role;
grant select on table private.meet_attendance_erasure_rooms to service_role;

create policy meet_attendance_erasure_rooms_service_read
  on private.meet_attendance_erasure_rooms
  for select
  to service_role
  using (true);

-- The room claims an intent needs. An account erasure also covers the guest
-- copy stored under the same id, which is how a signed-in person who was not
-- a workspace member is recorded.
create function private.meet_attendance_claim_keys(p_plan jsonb)
returns text[]
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  keys text[] := '{}'::text[];
  subject_user text := p_plan->'sql'->>'userId';
  subject_guest text := p_plan->'sql'->>'guestId';
begin
  if p_plan->'sql'->>'op' in ('meeting', 'workspace') then
    return array['meeting'];
  end if;
  if p_plan->'sql'->>'op' is distinct from 'subject' then
    return keys;
  end if;
  if subject_user ~* '^[0-9a-f-]{36}$' then
    keys := keys || ('user:' || subject_user) || ('guest:' || subject_user);
  end if;
  if subject_guest ~* '^[0-9a-f-]{36}$'
    and subject_guest is distinct from subject_user then
    keys := keys || ('guest:' || subject_guest);
  end if;
  return keys;
end;
$$;

revoke all on function private.meet_attendance_claim_keys(jsonb)
  from public, anon, authenticated;
grant execute on function private.meet_attendance_claim_keys(jsonb)
  to service_role;

-- Every writer of an intent (the delete functions and the app) stores the
-- plan; this trigger keeps the room rows in the same transaction. A higher
-- generation replaces the acknowledgements from an older one. The same
-- generation merges them. A lower generation is a stale copy and is ignored.
create function private.store_meet_attendance_erasure_rooms(
  p_kind text,
  p_subject_key text,
  p_plan jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  keys text[] := private.meet_attendance_claim_keys(p_plan);
  room jsonb;
  target_room text;
  room_ws uuid;
  room_meeting uuid;
  room_generation bigint;
  room_posted text[];
begin
  if pg_catalog.cardinality(keys) = 0 then
    return;
  end if;
  for room in
    select value
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_plan->'rooms') = 'array'
          then p_plan->'rooms'
        else '[]'::jsonb
      end
    )
  loop
    target_room := room->>'roomId';
    if target_room is null
      or target_room !~* '^[0-9a-f-]{36}:[0-9a-f-]{36}$'
      or room->>'wsId' is distinct from pg_catalog.split_part(target_room, ':', 1)
      or room->>'meetingId' is distinct from pg_catalog.split_part(target_room, ':', 2)
    then
      continue;
    end if;
    room_ws := (room->>'wsId')::uuid;
    room_meeting := (room->>'meetingId')::uuid;
    room_generation := null;
    if pg_catalog.jsonb_typeof(room->'generation') = 'number'
      and (room->>'generation') ~ '^[1-9][0-9]{0,17}$' then
      room_generation := (room->>'generation')::bigint;
    end if;
    select coalesce(pg_catalog.array_agg(posted.key), '{}'::text[])
    into room_posted
    from pg_catalog.jsonb_array_elements_text(
      case
        when pg_catalog.jsonb_typeof(room->'posted') = 'array' then room->'posted'
        else '[]'::jsonb
      end
    ) as posted(key)
    where posted.key = any (keys);
    if room_generation is null then
      room_posted := '{}'::text[];
    end if;

    insert into private.meet_attendance_erasure_rooms as stored (
      kind, subject_key, room_id, ws_id, meeting_id, generation, claim_keys, acked_keys
    )
    values (
      p_kind, p_subject_key, target_room, room_ws, room_meeting,
      room_generation, keys, room_posted
    )
    on conflict (kind, subject_key, room_id) do update
    set
      generation = case
        when excluded.generation is null then stored.generation
        when stored.generation is null or excluded.generation > stored.generation
          then excluded.generation
        else stored.generation
      end,
      acked_keys = case
        when excluded.generation is null then stored.acked_keys
        when stored.generation is null or excluded.generation > stored.generation
          then excluded.acked_keys
        when excluded.generation = stored.generation then array(
          select distinct merged.key
          from pg_catalog.unnest(stored.acked_keys || excluded.acked_keys) as merged(key)
          order by merged.key
        )
        else stored.acked_keys
      end,
      lease_until = case
        when excluded.generation is not null
          and (stored.generation is null or excluded.generation > stored.generation)
          then null
        else stored.lease_until
      end;
  end loop;
end;
$$;

revoke all on function private.store_meet_attendance_erasure_rooms(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.sync_meet_attendance_erasure_rooms()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.plan->'rooms' is not distinct from new.plan->'rooms' then
    return null;
  end if;
  perform private.store_meet_attendance_erasure_rooms(new.kind, new.subject_key, new.plan);
  return null;
end;
$$;

revoke all on function private.sync_meet_attendance_erasure_rooms()
  from public, anon, authenticated, service_role;

create trigger meet_attendance_erasure_rooms_sync
  after insert or update of plan on private.meet_attendance_pending_erasures
  for each row execute function private.sync_meet_attendance_erasure_rooms();

-- Rooms already named on stored intents.
select private.store_meet_attendance_erasure_rooms(pending.kind, pending.subject_key, pending.plan)
from private.meet_attendance_pending_erasures as pending;

-- The single writer for an intent's plan. The row lock makes the merge
-- atomic with concurrent writers: a confirmed intent never returns to
-- planned, a room keeps its highest generation with that generation's
-- acknowledgements, and finished SQL work stays finished.
create or replace function private.store_meet_attendance_intent(
  p_kind text,
  p_subject_key text,
  p_plan jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  existing jsonb;
  merged jsonb := coalesce(p_plan, '{}'::jsonb);
  rooms jsonb;
  room jsonb;
  prior jsonb;
  room_id text;
  prior_generation bigint;
  room_generation bigint;
begin
  if p_kind not in ('meeting', 'workspace', 'subject')
    or p_subject_key is null
    or p_subject_key = '' then
    raise exception 'Meet attendance intent is invalid';
  end if;

  select plan into existing
  from private.meet_attendance_pending_erasures
  where kind = p_kind
    and subject_key = p_subject_key
  for update;

  if existing is not null
    and existing->>'phase' = 'confirmed'
    and coalesce(merged->>'phase', '') is distinct from 'confirmed' then
    return;
  end if;

  if existing is not null and existing->>'phase' = 'confirmed' then
    rooms := case
      when pg_catalog.jsonb_typeof(existing->'rooms') = 'array' then existing->'rooms'
      else '[]'::jsonb
    end;
    for room in
      select value
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(merged->'rooms') = 'array' then merged->'rooms'
          else '[]'::jsonb
        end
      )
    loop
      room_id := room->>'roomId';
      if room_id is null or room_id = '' then
        continue;
      end if;
      select value into prior
      from pg_catalog.jsonb_array_elements(rooms)
      where value->>'roomId' = room_id
      limit 1;
      if prior is null then
        rooms := rooms || pg_catalog.jsonb_build_array(room);
        continue;
      end if;
      prior_generation := case
        when pg_catalog.jsonb_typeof(prior->'generation') = 'number'
          then (prior->>'generation')::numeric::bigint
      end;
      room_generation := case
        when pg_catalog.jsonb_typeof(room->'generation') = 'number'
          then (room->>'generation')::numeric::bigint
      end;
      if room_generation is not null
        and (prior_generation is null or room_generation > prior_generation) then
        prior := pg_catalog.jsonb_set(prior, '{generation}', pg_catalog.to_jsonb(room_generation), true);
        prior := pg_catalog.jsonb_set(prior, '{posted}', coalesce(room->'posted', '[]'::jsonb), true);
      elsif room_generation is not null and room_generation = prior_generation then
        prior := pg_catalog.jsonb_set(prior, '{posted}', (
          select coalesce(pg_catalog.jsonb_agg(distinct key order by key), '[]'::jsonb)
          from pg_catalog.jsonb_array_elements_text(
            coalesce(prior->'posted', '[]'::jsonb) || coalesce(room->'posted', '[]'::jsonb)
          ) as posted(key)
        ), true);
      end if;
      select coalesce(pg_catalog.jsonb_agg(
        case when value->>'roomId' = room_id then prior else value end
        order by ordinality
      ), '[]'::jsonb)
      into rooms
      from pg_catalog.jsonb_array_elements(rooms) with ordinality;
      prior := null;
    end loop;
    merged := pg_catalog.jsonb_set(merged, '{rooms}', rooms, true);
    merged := pg_catalog.jsonb_set(merged, '{phase}', '"confirmed"'::jsonb, true);
    if coalesce(existing->>'sqlDone', '') = 'true'
      or coalesce(merged->>'sqlDone', '') = 'true' then
      merged := pg_catalog.jsonb_set(merged, '{sqlDone}', 'true'::jsonb, true);
    end if;
    merged := pg_catalog.jsonb_set(
      merged,
      '{attempts}',
      pg_catalog.to_jsonb(greatest(
        coalesce((existing->>'attempts')::integer, 0),
        coalesce((merged->>'attempts')::integer, 0)
      )),
      true
    );
  end if;

  insert into private.meet_attendance_pending_erasures as pending (
    kind, subject_key, plan
  )
  values (p_kind, p_subject_key, merged)
  on conflict (kind, subject_key)
  do update set plan = excluded.plan;
end;
$$;

revoke all on function private.store_meet_attendance_intent(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.store_meet_attendance_intent(text, text, jsonb)
  to service_role;

-- Account deletion cannot share a transaction with the app, so the intent is
-- stored first as planned. Removing the auth row confirms it in the same
-- transaction as the delete.
create function private.confirm_meet_attendance_account_erasure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update private.meet_attendance_pending_erasures as pending
  set plan = pg_catalog.jsonb_set(pending.plan, '{phase}', '"confirmed"'::jsonb, true)
  where pending.kind = 'subject'
    and pending.subject_key = 'user:' || old.id::text
    and pending.plan->>'phase' is distinct from 'confirmed';
  return null;
end;
$$;

revoke all on function private.confirm_meet_attendance_account_erasure()
  from public, anon, authenticated, service_role;

create trigger meet_attendance_confirm_account_erasure
  after delete on auth.users
  for each row execute function private.confirm_meet_attendance_account_erasure();

-- One bounded page of rooms to erase. Each claimed room gets a lease, so an
-- overlapping run skips it; a crash before the acknowledgement lets the lease
-- lapse and the room is claimed again. A room without a generation gets one
-- from the fence here. Repeated failures back off and stop at 16 attempts.
create function private.claim_meet_attendance_erasure_rooms(
  p_limit integer default 64,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
  claimed record;
  claimed_generation bigint;
  rooms jsonb := '[]'::jsonb;
  stuck integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 128 then
    raise exception 'p_limit must be between 1 and 128' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'p_lease_seconds must be between 30 and 900' using errcode = '22023';
  end if;

  select control.stopped
  into retention_stopped
  from private.meet_attendance_retention_control as control
  where control.id;

  if coalesce(retention_stopped, true) then
    return pg_catalog.jsonb_build_object('state', 'fenced', 'rooms', '[]'::jsonb, 'stuck', 0);
  end if;

  for claimed in
    select room.kind, room.subject_key, room.room_id, room.ws_id,
      room.meeting_id, room.generation, room.claim_keys, room.acked_keys,
      room.attempts
    from private.meet_attendance_erasure_rooms as room
    join private.meet_attendance_pending_erasures as pending
      on pending.kind = room.kind
      and pending.subject_key = room.subject_key
    where pending.plan->>'phase' = 'confirmed'
      and not (room.claim_keys <@ room.acked_keys)
      and (room.lease_until is null or room.lease_until <= pg_catalog.clock_timestamp())
      and room.attempts < 16
    order by room.lease_until nulls first, room.kind, room.subject_key, room.room_id
    limit p_limit
    for update of room skip locked
  loop
    claimed_generation := claimed.generation;
    if claimed_generation is null then
      insert into private.meet_attendance_fences as fence (meeting_id, ws_id, generation)
      values (claimed.meeting_id, claimed.ws_id, 1)
      on conflict (meeting_id, ws_id)
      do update set generation = fence.generation + 1
      returning fence.generation into claimed_generation;
    end if;

    update private.meet_attendance_erasure_rooms as room
    set
      generation = claimed_generation,
      attempts = room.attempts + 1,
      lease_until = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(secs => p_lease_seconds * least(room.attempts + 1, 8))
    where room.kind = claimed.kind
      and room.subject_key = claimed.subject_key
      and room.room_id = claimed.room_id;

    rooms := rooms || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'kind', claimed.kind,
      'subjectKey', claimed.subject_key,
      'roomId', claimed.room_id,
      'generation', claimed_generation,
      'keys', (
        select coalesce(pg_catalog.jsonb_agg(wanted.key order by wanted.key), '[]'::jsonb)
        from pg_catalog.unnest(claimed.claim_keys) as wanted(key)
        where not (wanted.key = any (claimed.acked_keys))
      )
    ));
  end loop;

  select pg_catalog.count(*)::integer
  into stuck
  from private.meet_attendance_erasure_rooms as room
  where room.attempts >= 16
    and not (room.claim_keys <@ room.acked_keys);

  return pg_catalog.jsonb_build_object('state', 'open', 'rooms', rooms, 'stuck', stuck);
end;
$$;

revoke all on function private.claim_meet_attendance_erasure_rooms(integer, integer)
  from public, anon, authenticated;
grant execute on function private.claim_meet_attendance_erasure_rooms(integer, integer)
  to service_role;

-- Records the claims a room accepted. Only the generation that was claimed
-- counts: a newer generation means a newer copy still needs erasing.
create function private.ack_meet_attendance_erasure_room(
  p_kind text,
  p_subject_key text,
  p_room_id text,
  p_generation bigint,
  p_keys text[]
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  update private.meet_attendance_erasure_rooms as room
  set
    acked_keys = array(
      select distinct merged.key
      from pg_catalog.unnest(
        room.acked_keys || array(
          select accepted.key
          from pg_catalog.unnest(coalesce(p_keys, '{}'::text[])) as accepted(key)
          where accepted.key = any (room.claim_keys)
        )
      ) as merged(key)
      order by merged.key
    ),
    lease_until = null
  where room.kind = p_kind
    and room.subject_key = p_subject_key
    and room.room_id = p_room_id
    and room.generation = p_generation;
  if found then
    return 'acked';
  end if;
  if exists (
    select 1
    from private.meet_attendance_erasure_rooms as room
    where room.kind = p_kind
      and room.subject_key = p_subject_key
      and room.room_id = p_room_id
  ) then
    return 'stale';
  end if;
  return 'missing';
end;
$$;

revoke all on function private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])
  from public, anon, authenticated;
grant execute on function private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])
  to service_role;

-- One page of intents. Planned intents are reconciled with the delete they
-- wait for: a missing auth user, meeting, or workspace confirms the intent; a
-- row that still exists a day later cancels it. Confirmed intents delete
-- their session rows and record that; the intent is removed only when its
-- session rows are gone and every room has acknowledged.
drop function if exists private.advance_meet_attendance_erasure_intents(integer);

create function private.advance_meet_attendance_erasure_intents(
  p_limit integer default 32
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
  intent_row record;
  intent_plan jsonb;
  subject_user uuid;
  subject_guest uuid;
  target_exists boolean;
  intents_advanced integer := 0;
  intents_finished integer := 0;
  intents_confirmed integer := 0;
  intents_cancelled integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 32 then
    raise exception 'p_limit must be between 1 and 32' using errcode = '22023';
  end if;

  select control.stopped
  into retention_stopped
  from private.meet_attendance_retention_control as control
  where control.id;

  if coalesce(retention_stopped, true) then
    return pg_catalog.jsonb_build_object(
      'state', 'fenced',
      'advanced', 0,
      'finished', 0,
      'confirmed', 0,
      'cancelled', 0
    );
  end if;

  for intent_row in
    select pending.kind, pending.subject_key, pending.plan, pending.created_at
    from private.meet_attendance_pending_erasures as pending
    where pending.plan->>'phase' is distinct from 'confirmed'
    order by pending.created_at, pending.kind, pending.subject_key
    limit p_limit
    for update skip locked
  loop
    target_exists := null;
    if intent_row.kind = 'subject'
      and intent_row.subject_key ~* '^user:[0-9a-f-]{36}$' then
      select exists (
        select 1 from auth.users as account
        where account.id = pg_catalog.substr(intent_row.subject_key, 6)::uuid
      ) into target_exists;
    elsif intent_row.kind = 'meeting'
      and intent_row.subject_key ~* '^[0-9a-f-]{36}$' then
      select exists (
        select 1 from public.workspace_meetings as meeting
        where meeting.id = intent_row.subject_key::uuid
      ) into target_exists;
    elsif intent_row.kind = 'workspace'
      and intent_row.subject_key ~* '^[0-9a-f-]{36}$' then
      select exists (
        select 1 from public.workspaces as workspace
        where workspace.id = intent_row.subject_key::uuid
      ) into target_exists;
    end if;

    if target_exists is false then
      update private.meet_attendance_pending_erasures as pending
      set plan = pg_catalog.jsonb_set(pending.plan, '{phase}', '"confirmed"'::jsonb, true)
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_confirmed := intents_confirmed + 1;
    elsif intent_row.created_at < pg_catalog.clock_timestamp() - interval '1 day' then
      delete from private.meet_attendance_pending_erasures as pending
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_cancelled := intents_cancelled + 1;
    end if;
  end loop;

  for intent_row in
    select pending.kind, pending.subject_key, pending.plan
    from private.meet_attendance_pending_erasures as pending
    where pending.plan->>'phase' = 'confirmed'
    order by
      coalesce(pending.plan->>'maintenanceAt', ''),
      pending.created_at,
      pending.kind,
      pending.subject_key
    limit p_limit
    for update skip locked
  loop
    intent_plan := intent_row.plan;
    subject_user := null;
    subject_guest := null;

    if intent_plan->'sql'->>'op' = 'meeting'
      and intent_plan->'sql'->>'meetingId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions as sessions
      where sessions.meeting_id = (intent_plan->'sql'->>'meetingId')::uuid;
    elsif intent_plan->'sql'->>'op' = 'workspace'
      and intent_plan->'sql'->>'wsId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions as sessions
      where sessions.ws_id = (intent_plan->'sql'->>'wsId')::uuid;
    elsif intent_plan->'sql'->>'op' = 'subject' then
      if intent_plan->'sql'->>'userId' ~* '^[0-9a-f-]{36}$' then
        subject_user := (intent_plan->'sql'->>'userId')::uuid;
      end if;
      if intent_plan->'sql'->>'guestId' ~* '^[0-9a-f-]{36}$' then
        subject_guest := (intent_plan->'sql'->>'guestId')::uuid;
      end if;
      if subject_user is not null or subject_guest is not null then
        delete from private.meet_attendance_sessions as sessions
        where (subject_user is not null and sessions.user_id = subject_user)
          or (subject_user is not null and sessions.guest_id = subject_user)
          or (subject_guest is not null and sessions.guest_id = subject_guest);
      end if;
    end if;

    if not exists (
      select 1
      from private.meet_attendance_erasure_rooms as room
      where room.kind = intent_row.kind
        and room.subject_key = intent_row.subject_key
        and not (room.claim_keys <@ room.acked_keys)
    ) then
      delete from private.meet_attendance_pending_erasures as pending
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_finished := intents_finished + 1;
    else
      update private.meet_attendance_pending_erasures as pending
      set plan = pending.plan || pg_catalog.jsonb_build_object(
        'sqlDone', true,
        'maintenanceAt', pg_catalog.clock_timestamp()
      )
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
    end if;
    intents_advanced := intents_advanced + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'state', 'open',
    'advanced', intents_advanced,
    'finished', intents_finished,
    'confirmed', intents_confirmed,
    'cancelled', intents_cancelled
  );
end;
$$;

revoke all on function private.advance_meet_attendance_erasure_intents(integer)
  from public, anon, authenticated;
grant execute on function private.advance_meet_attendance_erasure_intents(integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
