begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Complete owner-run definitions with explicit ACLs for the attendance
-- erasure routines. Each runs with a pinned search_path. The claim and
-- acknowledgement functions are executable only by service_role; the room
-- helper and the trigger function are executable by no client role.

create or replace function private.claim_meet_attendance_erasure_rooms(
  p_limit integer default 64,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
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

create or replace function private.ack_meet_attendance_erasure_room(
  p_kind text,
  p_subject_key text,
  p_room_id text,
  p_generation bigint,
  p_keys text[]
) returns text
language plpgsql
security definer
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

-- tuturuuu: no-grant (internal)
create or replace function private.store_meet_attendance_erasure_rooms(
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

-- tuturuuu: no-grant (trigger)
create or replace function private.sync_meet_attendance_erasure_rooms()
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

notify pgrst, 'reload schema';
commit;
