begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Durable proof that the Cloudflare erasure job runs end to end: the
-- deployed AttendanceErasure binding erased a probe room, and the job's
-- claim and advance calls ran as service_role, while the stop fence was open.
create table private.meet_attendance_erasure_readiness (
  id boolean primary key default true check (id),
  verified_at timestamptz not null
);

comment on table private.meet_attendance_erasure_readiness is
  'Last time the Cloudflare attendance erasure job proved its binding and database role. Attendance storage requires a recent proof.';

alter table private.meet_attendance_erasure_readiness enable row level security;
revoke all on table private.meet_attendance_erasure_readiness
  from public, anon, authenticated, service_role;
grant select on table private.meet_attendance_erasure_readiness to service_role;

create policy meet_attendance_erasure_readiness_service_read
  on private.meet_attendance_erasure_readiness
  for select
  to service_role
  using (true);

-- The erasure functions the job needs, with the privileges they must have.
-- tuturuuu: no-grant (internal)
create function private.meet_attendance_erasure_grants_ok()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.bool_and(
    pg_catalog.has_function_privilege('service_role', fn, 'execute')
    and not pg_catalog.has_function_privilege('anon', fn, 'execute')
    and not pg_catalog.has_function_privilege('authenticated', fn, 'execute')
    and coalesce((select proc.prosecdef from pg_catalog.pg_proc as proc where proc.oid = fn), false)
  ) and pg_catalog.count(*) = 5
  from (
    select pg_catalog.to_regprocedure(signature)::oid as fn
    from pg_catalog.unnest(array[
      'private.claim_meet_attendance_erasure_rooms(integer, integer)',
      'private.ack_meet_attendance_erasure_room(text, text, text, bigint, text[])',
      'private.advance_meet_attendance_erasure_intents(integer)',
      'private.cancel_meet_attendance_intent(text, text, text)',
      'private.finish_meet_attendance_intent(text, text)'
    ]) as required(signature)
    where pg_catalog.to_regprocedure(signature) is not null
  ) as present;
$$;

revoke all on function private.meet_attendance_erasure_grants_ok()
  from public, anon, authenticated, service_role;

-- Called by the erasure job after its binding probe and its claim and advance
-- calls succeed in the same run. Records nothing while the stop fence is
-- closed or the function privileges are not as required.
create function private.record_meet_attendance_erasure_ready(
  p_binding_erased boolean
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  retention_stopped boolean;
begin
  if p_binding_erased is distinct from true then
    return 'binding';
  end if;
  select control.stopped
  into retention_stopped
  from private.meet_attendance_retention_control as control
  where control.id;
  if coalesce(retention_stopped, true) then
    return 'fenced';
  end if;
  if not coalesce(private.meet_attendance_erasure_grants_ok(), false) then
    return 'grants';
  end if;
  insert into private.meet_attendance_erasure_readiness as readiness (id, verified_at)
  values (true, pg_catalog.clock_timestamp())
  on conflict (id) do update set verified_at = excluded.verified_at;
  return 'ready';
end;
$$;

revoke all on function private.record_meet_attendance_erasure_ready(boolean)
  from public, anon, authenticated;
grant execute on function private.record_meet_attendance_erasure_ready(boolean)
  to service_role;

-- Ready means a proof from the last two days, the stop fence still open, and
-- the privileges still as required.
create function private.meet_attendance_erasure_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    exists (
      select 1
      from private.meet_attendance_erasure_readiness as readiness
      where readiness.verified_at > pg_catalog.clock_timestamp() - interval '2 days'
    )
    and exists (
      select 1
      from private.meet_attendance_retention_control as control
      where control.id and not control.stopped
    )
    and coalesce(private.meet_attendance_erasure_grants_ok(), false);
$$;

revoke all on function private.meet_attendance_erasure_ready()
  from public, anon, authenticated;
grant execute on function private.meet_attendance_erasure_ready()
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

  -- No attendance is stored unless the Cloudflare erasure job has proven,
  -- recently and with the stop fence open, that it can erase what is stored.
  if not private.meet_attendance_erasure_ready() then
    raise exception 'Meet attendance erasure is not verified'
      using errcode = '55000';
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

notify pgrst, 'reload schema';
commit;
