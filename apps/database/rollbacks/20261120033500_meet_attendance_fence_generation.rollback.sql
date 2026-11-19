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

drop table if exists private.meet_attendance_pending_erasures;
drop function if exists private.bump_meet_attendance_fence(uuid, uuid);

commit;
