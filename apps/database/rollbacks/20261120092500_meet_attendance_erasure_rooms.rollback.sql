begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Copy room progress back onto each plan first, so the earlier functions see
-- every acknowledgement and no erasure work is lost.
update private.meet_attendance_pending_erasures as pending
set plan = pg_catalog.jsonb_set(
  pending.plan,
  '{rooms}',
  (
    select coalesce(pg_catalog.jsonb_agg(
      case
        when room.room_id is null then plan_room.value
        else plan_room.value || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'generation', room.generation,
          'posted', case
            when room.generation is null then null
            else pg_catalog.to_jsonb(room.acked_keys)
          end
        ))
      end
      order by plan_room.ordinality
    ), '[]'::jsonb)
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(pending.plan->'rooms') = 'array'
          then pending.plan->'rooms'
        else '[]'::jsonb
      end
    ) with ordinality as plan_room(value, ordinality)
    left join private.meet_attendance_erasure_rooms as room
      on room.kind = pending.kind
      and room.subject_key = pending.subject_key
      and room.room_id = plan_room.value->>'roomId'
  ),
  true
)
where exists (
  select 1
  from private.meet_attendance_erasure_rooms as room
  where room.kind = pending.kind
    and room.subject_key = pending.subject_key
);

drop trigger if exists meet_attendance_confirm_account_erasure on auth.users;
drop trigger if exists meet_attendance_erasure_rooms_sync
  on private.meet_attendance_pending_erasures;
drop function if exists private.confirm_meet_attendance_account_erasure();
drop function if exists private.sync_meet_attendance_erasure_rooms();
drop function if exists private.store_meet_attendance_erasure_rooms(text, text, jsonb);
drop function if exists private.claim_meet_attendance_erasure_rooms(integer, integer);
drop function if exists private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[]);
drop function if exists private.meet_attendance_claim_keys(jsonb);
drop table if exists private.meet_attendance_erasure_rooms;

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
  room_id text;
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
    rooms := coalesce(existing->'rooms', '[]'::jsonb);
    for room in
      select value
      from pg_catalog.jsonb_array_elements(coalesce(merged->'rooms', '[]'::jsonb))
    loop
      room_id := room->>'roomId';
      if room_id is null or room_id = '' then
        continue;
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(rooms) existing_room
        where existing_room->>'roomId' = room_id
      ) then
        continue;
      end if;
      rooms := rooms || pg_catalog.jsonb_build_array(room);
    end loop;
    merged := pg_catalog.jsonb_set(merged, '{rooms}', rooms, true);
    merged := pg_catalog.jsonb_set(merged, '{phase}', '"confirmed"'::jsonb, true);
    if coalesce(existing->>'sqlDone', '') = 'true'
      or coalesce(p_plan->>'sqlDone', '') = 'true' then
      merged := pg_catalog.jsonb_set(merged, '{sqlDone}', 'true'::jsonb, true);
    end if;
    merged := pg_catalog.jsonb_set(
      merged,
      '{attempts}',
      pg_catalog.to_jsonb(greatest(
        coalesce((existing->>'attempts')::integer, 0),
        coalesce((p_plan->>'attempts')::integer, 0)
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
  claim_keys jsonb;
  intent_settled boolean;
  subject_user uuid;
  subject_guest uuid;
  intents_advanced integer := 0;
  intents_finished integer := 0;
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
      'finished', 0
    );
  end if;

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

    claim_keys := '[]'::jsonb;
    if intent_plan->'sql'->>'op' in ('meeting', 'workspace') then
      claim_keys := jsonb_build_array('meeting');
    elsif intent_plan->'sql'->>'op' = 'subject' then
      if subject_user is not null then
        claim_keys := claim_keys || jsonb_build_array(
          'user:' || (intent_plan->'sql'->>'userId'),
          'guest:' || (intent_plan->'sql'->>'userId')
        );
      end if;
      if subject_guest is not null then
        claim_keys := claim_keys || jsonb_build_array(
          'guest:' || (intent_plan->'sql'->>'guestId')
        );
      end if;
    end if;

    intent_settled :=
      coalesce(intent_plan->>'sqlDone', '') = 'true'
      and jsonb_typeof(intent_plan->'rooms') = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(intent_plan->'rooms') as room
        where exists (
          select 1
          from jsonb_array_elements_text(claim_keys) as claim_list(claim_key)
          where not jsonb_exists(
            coalesce(room->'posted', '[]'::jsonb),
            claim_list.claim_key
          )
        )
      );

    if intent_settled then
      delete from private.meet_attendance_pending_erasures as pending
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
      intents_finished := intents_finished + 1;
    else
      update private.meet_attendance_pending_erasures as pending
      set plan = jsonb_set(
        pending.plan,
        '{maintenanceAt}',
        to_jsonb(pg_catalog.clock_timestamp()),
        true
      )
      where pending.kind = intent_row.kind
        and pending.subject_key = intent_row.subject_key;
    end if;
    intents_advanced := intents_advanced + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'state', 'open',
    'advanced', intents_advanced,
    'finished', intents_finished
  );
end;
$$;

revoke all on function private.advance_meet_attendance_erasure_intents(integer)
  from public, anon, authenticated;
grant execute on function private.advance_meet_attendance_erasure_intents(integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
