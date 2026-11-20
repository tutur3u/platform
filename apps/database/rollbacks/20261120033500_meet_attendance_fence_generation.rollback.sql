begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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

do $$
declare
  pending record;
  subject_user uuid;
  subject_guest uuid;
begin
  for pending in
    select kind, subject_key, plan
    from private.meet_attendance_pending_erasures
    where plan->>'phase' = 'confirmed'
  loop
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
  end loop;
end;
$$;

drop table if exists private.meet_attendance_pending_erasures;
drop function if exists private.bump_meet_attendance_fence(uuid, uuid);

commit;
