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

-- Drain confirmed erasures before dropping the pending-plan table.
lock table private.meet_attendance_pending_erasures in access exclusive mode;

with confirmed as materialized (
  select
    case when plan->'sql'->>'op' = 'meeting'
      and plan->'sql'->>'meetingId' ~* '^[0-9a-f-]{36}$'
      then (plan->'sql'->>'meetingId')::uuid end as meeting_id,
    case when plan->'sql'->>'op' = 'workspace'
      and plan->'sql'->>'wsId' ~* '^[0-9a-f-]{36}$'
      then (plan->'sql'->>'wsId')::uuid end as ws_id,
    case when plan->'sql'->>'op' = 'subject'
      and plan->'sql'->>'userId' ~* '^[0-9a-f-]{36}$'
      then (plan->'sql'->>'userId')::uuid end as user_id,
    case when plan->'sql'->>'op' = 'subject'
      and plan->'sql'->>'guestId' ~* '^[0-9a-f-]{36}$'
      then (plan->'sql'->>'guestId')::uuid end as guest_id
  from private.meet_attendance_pending_erasures
  where plan->>'phase' = 'confirmed'
)
delete from private.meet_attendance_sessions as session
using confirmed
where session.meeting_id = confirmed.meeting_id
  or session.ws_id = confirmed.ws_id
  or session.user_id = confirmed.user_id
  or session.guest_id = confirmed.user_id
  or session.guest_id = confirmed.guest_id;

drop table if exists private.meet_attendance_pending_erasures;
drop function if exists private.bump_meet_attendance_fence(uuid, uuid);

commit;
