-- One atomic generation is the attendance fence. A pending row outlives the
-- meeting so a confirmed delete can finish after a failed commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.bump_meet_attendance_fence(
  p_meeting_id uuid,
  p_ws_id uuid
) returns bigint
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  insert into private.meet_attendance_fences as fence (
    meeting_id, ws_id, generation
  )
  values (p_meeting_id, p_ws_id, 1)
  on conflict (meeting_id, ws_id)
  do update set generation = fence.generation + 1
  returning generation;
$$;

revoke all on function private.bump_meet_attendance_fence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.bump_meet_attendance_fence(uuid, uuid)
  to service_role;

create table private.meet_attendance_pending_erasures (
  kind text not null,
  subject_key text not null,
  plan jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (kind, subject_key),
  constraint meet_attendance_pending_kind
    check (kind in ('meeting', 'workspace', 'subject'))
);

comment on table private.meet_attendance_pending_erasures is
  'Confirmed attendance erasure that still has work left. No meeting foreign key: the row must survive deletion of the meeting.';

alter table private.meet_attendance_pending_erasures enable row level security;

revoke all on table private.meet_attendance_pending_erasures
  from public, anon, authenticated;
grant select, insert, update, delete
  on table private.meet_attendance_pending_erasures
  to service_role;

create or replace function private.purge_expired_meet_attendance(
  p_now timestamptz default pg_catalog.now()
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  removed integer := 0;
  pending record;
  batch integer := 0;
  subject_user uuid;
  subject_guest uuid;
begin
  delete from private.meet_attendance_sessions
  where joined_at < p_now - interval '90 days';
  get diagnostics removed = row_count;

  for pending in
    select kind, subject_key, plan
    from private.meet_attendance_pending_erasures
    where plan->>'phase' = 'confirmed'
    order by created_at
    limit 50
  loop
    batch := batch + 1;
    if pending.plan->'sql'->>'op' = 'meeting'
      and pending.plan->'sql'->>'meetingId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions
      where meeting_id = (pending.plan->'sql'->>'meetingId')::uuid;
    elsif pending.plan->'sql'->>'op' = 'workspace'
      and pending.plan->'sql'->>'wsId' ~* '^[0-9a-f-]{36}$'
    then
      delete from private.meet_attendance_sessions
      where ws_id = (pending.plan->'sql'->>'wsId')::uuid;
    elsif pending.plan->'sql'->>'op' = 'subject' then
      subject_user := null;
      subject_guest := null;
      if pending.plan->'sql'->>'userId' ~* '^[0-9a-f-]{36}$' then
        subject_user := (pending.plan->'sql'->>'userId')::uuid;
      end if;
      if pending.plan->'sql'->>'guestId' ~* '^[0-9a-f-]{36}$' then
        subject_guest := (pending.plan->'sql'->>'guestId')::uuid;
      end if;
      if subject_user is not null or subject_guest is not null then
        delete from private.meet_attendance_sessions
        where (subject_user is not null and user_id = subject_user)
          or (subject_user is not null and guest_id = subject_user)
          or (subject_guest is not null and guest_id = subject_guest);
      end if;
    end if;
    delete from private.meet_attendance_pending_erasures
    where kind = pending.kind
      and subject_key = pending.subject_key;
  end loop;

  return removed + batch;
end;
$$;

revoke all on function private.purge_expired_meet_attendance(timestamptz)
  from public, anon, authenticated;
grant execute on function private.purge_expired_meet_attendance(timestamptz)
  to service_role;

commit;
