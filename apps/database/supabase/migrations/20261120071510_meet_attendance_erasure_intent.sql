begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.meet_attendance_confirm_plan(
  p_plan jsonb,
  p_sql jsonb,
  p_rooms jsonb
) returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  plan jsonb := coalesce(p_plan, '{}'::jsonb);
  rooms jsonb := coalesce(plan->'rooms', '[]'::jsonb);
  room jsonb;
  room_id text;
begin
  plan := pg_catalog.jsonb_set(plan, '{phase}', '"confirmed"'::jsonb, true);
  plan := pg_catalog.jsonb_set(plan, '{sqlDone}', 'true'::jsonb, true);
  plan := pg_catalog.jsonb_set(plan, '{sql}', coalesce(p_sql, '{}'::jsonb), true);
  for room in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
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
  return pg_catalog.jsonb_set(plan, '{rooms}', rooms, true);
end;
$$;

revoke all on function private.meet_attendance_confirm_plan(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function private.meet_attendance_confirm_plan(jsonb, jsonb, jsonb)
  to service_role;

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
      pg_catalog.to_jsonb(pg_catalog.greatest(
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

create or replace function private.commit_meet_attendance_upsert(
  p_meeting_id uuid,
  p_ws_id uuid,
  p_epoch bigint,
  p_rows jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  current_generation bigint;
  attendance_row jsonb;
  attendance_source_key text;
  attendance_kind text;
  attendance_user_id uuid;
  attendance_guest_id uuid;
begin
  if pg_catalog.jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    return;
  end if;

  insert into private.meet_attendance_fences as fence (
    meeting_id, ws_id, generation
  )
  values (p_meeting_id, p_ws_id, 0)
  on conflict (meeting_id, ws_id) do nothing;

  select fence.generation into current_generation
  from private.meet_attendance_fences fence
  where fence.meeting_id = p_meeting_id
    and fence.ws_id = p_ws_id
  for update;

  if current_generation > coalesce(p_epoch, 0) then
    raise exception 'Meet attendance sync was fenced'
      using errcode = '40001';
  end if;

  for attendance_row in
    select value
    from pg_catalog.jsonb_array_elements(p_rows)
    order by value->>'sourceKey'
  loop
    attendance_source_key := attendance_row->>'sourceKey';
    attendance_kind := attendance_row->>'kind';
    if attendance_source_key is null or attendance_source_key = '' then
      continue;
    end if;
    attendance_user_id := null;
    attendance_guest_id := null;
    if attendance_kind = 'member' and attendance_row->>'userId' ~* '^[0-9a-f-]{36}$' then
      attendance_user_id := (attendance_row->>'userId')::uuid;
    elsif attendance_kind = 'guest' and attendance_row->>'guestId' ~* '^[0-9a-f-]{36}$' then
      attendance_guest_id := (attendance_row->>'guestId')::uuid;
    end if;

    insert into private.meet_attendance_sessions (
      meeting_id,
      ws_id,
      source_key,
      participant_kind,
      user_id,
      guest_id,
      display_name,
      joined_at,
      left_at
    )
    values (
      p_meeting_id,
      p_ws_id,
      attendance_source_key,
      attendance_kind,
      attendance_user_id,
      attendance_guest_id,
      attendance_row->>'displayName',
      (attendance_row->>'joinedAt')::timestamptz,
      nullif(attendance_row->>'leftAt', '')::timestamptz
    )
    on conflict (meeting_id, source_key) do update
    set
      participant_kind = excluded.participant_kind,
      user_id = excluded.user_id,
      guest_id = excluded.guest_id,
      display_name = excluded.display_name,
      joined_at = excluded.joined_at,
      left_at = excluded.left_at
    where private.meet_attendance_sessions.ws_id = excluded.ws_id;
  end loop;
end;
$$;

revoke all on function private.commit_meet_attendance_upsert(uuid, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.commit_meet_attendance_upsert(uuid, uuid, bigint, jsonb)
  to service_role;

create or replace function private.delete_meeting_with_attendance_intent(
  p_ws_id uuid,
  p_meeting_id uuid,
  p_plan jsonb
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  found_id uuid;
  extra jsonb;
  plan jsonb;
begin
  select meeting.id into found_id
  from public.workspace_meetings meeting
  where meeting.id = p_meeting_id
    and meeting.ws_id = p_ws_id
  for update;
  if not found then
    return 'not_deleted';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roomId', session.ws_id::text || ':' || session.meeting_id::text,
    'wsId', session.ws_id::text,
    'meetingId', session.meeting_id::text
  )), '[]'::jsonb)
  into extra
  from (
    select distinct ws_id, meeting_id
    from private.meet_attendance_sessions
    where meeting_id = p_meeting_id
  ) session;

  plan := private.meet_attendance_confirm_plan(
    p_plan,
    pg_catalog.jsonb_build_object(
      'op', 'meeting',
      'meetingId', p_meeting_id::text
    ),
    extra
  );
  perform private.store_meet_attendance_intent(
    'meeting',
    p_meeting_id::text,
    plan
  );

  delete from public.workspace_meetings
  where id = p_meeting_id
    and ws_id = p_ws_id;
  if not found then
    raise exception 'Meet attendance meeting delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;

revoke all on function private.delete_meeting_with_attendance_intent(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.delete_meeting_with_attendance_intent(uuid, uuid, jsonb)
  to service_role;

create or replace function private.delete_workspace_with_attendance_intent(
  p_ws_id uuid,
  p_plan jsonb
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  found_id uuid;
  extra jsonb;
  plan jsonb;
begin
  select workspace.id into found_id
  from public.workspaces workspace
  where workspace.id = p_ws_id
  for update;
  if not found then
    return 'not_deleted';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roomId', session.ws_id::text || ':' || session.meeting_id::text,
    'wsId', session.ws_id::text,
    'meetingId', session.meeting_id::text
  )), '[]'::jsonb)
  into extra
  from (
    select distinct ws_id, meeting_id
    from private.meet_attendance_sessions
    where ws_id = p_ws_id
  ) session;

  plan := private.meet_attendance_confirm_plan(
    p_plan,
    pg_catalog.jsonb_build_object('op', 'workspace', 'wsId', p_ws_id::text),
    extra
  );
  perform private.store_meet_attendance_intent('workspace', p_ws_id::text, plan);

  delete from public.workspaces where id = p_ws_id;
  if not found then
    raise exception 'Meet attendance workspace delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;

revoke all on function private.delete_workspace_with_attendance_intent(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.delete_workspace_with_attendance_intent(uuid, jsonb)
  to service_role;

create or replace function private.delete_owned_workspace_with_attendance_intent(
  p_ws_id uuid,
  p_actor_id uuid,
  p_confirmation text,
  p_plan jsonb
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  result text;
  extra jsonb;
  plan jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roomId', session.ws_id::text || ':' || session.meeting_id::text,
    'wsId', session.ws_id::text,
    'meetingId', session.meeting_id::text
  )), '[]'::jsonb)
  into extra
  from (
    select distinct ws_id, meeting_id
    from private.meet_attendance_sessions
    where ws_id = p_ws_id
  ) session;

  result := public.delete_owned_workspace(p_ws_id, p_actor_id, p_confirmation);
  if result is distinct from 'deleted' then
    return result;
  end if;

  plan := private.meet_attendance_confirm_plan(
    p_plan,
    pg_catalog.jsonb_build_object('op', 'workspace', 'wsId', p_ws_id::text),
    extra
  );
  perform private.store_meet_attendance_intent('workspace', p_ws_id::text, plan);
  return 'deleted';
end;
$$;

revoke all on function private.delete_owned_workspace_with_attendance_intent(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.delete_owned_workspace_with_attendance_intent(uuid, uuid, text, jsonb)
  to service_role;

create or replace function private.purge_expired_meet_attendance(
  p_now timestamptz default pg_catalog.now()
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  removed integer;
begin
  delete from private.meet_attendance_sessions
  where joined_at < p_now - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.purge_expired_meet_attendance(timestamptz)
  from public, anon, authenticated;
grant execute on function private.purge_expired_meet_attendance(timestamptz)
  to service_role;

notify pgrst, 'reload schema';
commit;
