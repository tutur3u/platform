begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The plan writer. A transaction-scoped advisory lock on the key serializes
-- writers, including the first ones while no row exists yet. A confirmed
-- intent never returns to planned, a room keeps its highest generation with
-- that generation's acknowledgements, and finished SQL work stays finished.
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

  -- FOR UPDATE locks nothing while the intent does not exist yet, so the
  -- first writers for a key serialize on a transaction-scoped advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private.meet_attendance_intent:' || p_kind || ':' || p_subject_key, 0)
  );

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
  do update set plan = case
    when pending.plan->>'phase' = 'confirmed'
      and excluded.plan->>'phase' is distinct from 'confirmed'
      then pending.plan
    else excluded.plan
  end;
end;
$$;

revoke all on function private.store_meet_attendance_intent(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.store_meet_attendance_intent(text, text, jsonb)
  to service_role;

-- service_role can only read the room table. The claim and acknowledgement
-- functions write it, so they run as their owner with a pinned search_path.
alter function private.claim_meet_attendance_erasure_rooms(integer, integer)
  security definer;
alter function private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])
  security definer;
revoke all on function private.claim_meet_attendance_erasure_rooms(integer, integer)
  from public, anon, authenticated;
grant execute on function private.claim_meet_attendance_erasure_rooms(integer, integer)
  to service_role;
revoke all on function private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])
  from public, anon, authenticated;
grant execute on function private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])
  to service_role;

-- One page of intents. A planned intent whose account, meeting, or workspace
-- is gone is confirmed. Any other planned intent stays pending: the schedule
-- never cancels one, because the delete it waits for may still be in flight
-- or its outcome may be unknown. Confirmed intents delete at most 1000 session
-- rows per call and finish only when those rows are gone and every room has
-- acknowledged. It reads auth.users, so it runs as its owner.
create or replace function private.advance_meet_attendance_erasure_intents(
  p_limit integer default 32
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
  intent_row record;
  intent_plan jsonb;
  subject_user uuid;
  subject_guest uuid;
  target_exists boolean;
  removed integer;
  intents_advanced integer := 0;
  intents_finished integer := 0;
  intents_confirmed integer := 0;
  intents_waiting integer := 0;
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
      'cancelled', 0,
      'waiting', 0
    );
  end if;

  for intent_row in
    select pending.kind, pending.subject_key, pending.plan, pending.created_at
    from private.meet_attendance_pending_erasures as pending
    where pending.plan->>'phase' is distinct from 'confirmed'
    order by
      coalesce(pending.plan->>'checkedAt', ''),
      pending.created_at,
      pending.kind,
      pending.subject_key
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
    else
      -- The target still exists or its state is unknown. The intent stays
      -- pending; only the attempt that recorded it can cancel it.
      update private.meet_attendance_pending_erasures as pending
      set plan = pending.plan || pg_catalog.jsonb_build_object(
        'checkedAt', pg_catalog.clock_timestamp()
      )
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_waiting := intents_waiting + 1;
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

    if intent_plan->'sql'->>'userId' ~* '^[0-9a-f-]{36}$' then
      subject_user := (intent_plan->'sql'->>'userId')::uuid;
    end if;
    if intent_plan->'sql'->>'guestId' ~* '^[0-9a-f-]{36}$' then
      subject_guest := (intent_plan->'sql'->>'guestId')::uuid;
    end if;

    -- At most 1000 session rows per intent per call. Deleted rows stay
    -- deleted, so the next call continues from the rows that remain.
    delete from private.meet_attendance_sessions as sessions
    where sessions.id in (
      select doomed.id
      from private.meet_attendance_sessions as doomed
      where (
          intent_plan->'sql'->>'op' = 'meeting'
          and intent_plan->'sql'->>'meetingId' ~* '^[0-9a-f-]{36}$'
          and doomed.meeting_id = (intent_plan->'sql'->>'meetingId')::uuid
        )
        or (
          intent_plan->'sql'->>'op' = 'workspace'
          and intent_plan->'sql'->>'wsId' ~* '^[0-9a-f-]{36}$'
          and doomed.ws_id = (intent_plan->'sql'->>'wsId')::uuid
        )
        or (
          intent_plan->'sql'->>'op' = 'subject'
          and (
            (subject_user is not null and doomed.user_id = subject_user)
            or (subject_user is not null and doomed.guest_id = subject_user)
            or (subject_guest is not null and doomed.guest_id = subject_guest)
          )
        )
      limit 1000
    );
    get diagnostics removed = row_count;

    if removed = 1000 then
      update private.meet_attendance_pending_erasures as pending
      set plan = pending.plan || pg_catalog.jsonb_build_object(
        'maintenanceAt', pg_catalog.clock_timestamp()
      )
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_advanced := intents_advanced + 1;
      continue;
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
    'cancelled', 0,
    'waiting', intents_waiting
  );
end;
$$;

revoke all on function private.advance_meet_attendance_erasure_intents(integer)
  from public, anon, authenticated;
grant execute on function private.advance_meet_attendance_erasure_intents(integer)
  to service_role;

-- Cancels a planned intent only for the attempt that recorded it, and only
-- while it is still planned. A confirmed intent or another attempt's plan is
-- kept. The check and the delete are one statement.
create function private.cancel_meet_attendance_intent(
  p_kind text,
  p_subject_key text,
  p_attempt text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_attempt is null or p_attempt = '' then
    return 'kept';
  end if;
  delete from private.meet_attendance_pending_erasures as pending
  where pending.kind = p_kind
    and pending.subject_key = p_subject_key
    and pending.plan->>'phase' is distinct from 'confirmed'
    and pending.plan->>'attempt' = p_attempt;
  if found then
    return 'cancelled';
  end if;
  return 'kept';
end;
$$;

revoke all on function private.cancel_meet_attendance_intent(text, text, text)
  from public, anon, authenticated;
grant execute on function private.cancel_meet_attendance_intent(text, text, text)
  to service_role;

-- Removes a confirmed intent only when its session rows are recorded as gone
-- and every room has acknowledged, in one statement.
create function private.finish_meet_attendance_intent(
  p_kind text,
  p_subject_key text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  delete from private.meet_attendance_pending_erasures as pending
  where pending.kind = p_kind
    and pending.subject_key = p_subject_key
    and pending.plan->>'phase' = 'confirmed'
    and pending.plan->>'sqlDone' = 'true'
    and not exists (
      select 1
      from private.meet_attendance_erasure_rooms as room
      where room.kind = pending.kind
        and room.subject_key = pending.subject_key
        and not (room.claim_keys <@ room.acked_keys)
    );
  if found then
    return 'finished';
  end if;
  return 'kept';
end;
$$;

revoke all on function private.finish_meet_attendance_intent(text, text)
  from public, anon, authenticated;
grant execute on function private.finish_meet_attendance_intent(text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
