begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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

drop function if exists private.meet_attendance_erasure_ready();
drop function if exists private.record_meet_attendance_erasure_ready(boolean);
drop function if exists private.meet_attendance_erasure_grants_ok();
drop table if exists private.meet_attendance_erasure_readiness;

notify pgrst, 'reload schema';
commit;
