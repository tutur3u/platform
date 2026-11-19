-- Attendance rows keep the workspace that collected them, and intervals
-- older than 90 days are deleted from joined_at.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.meet_attendance_reject_workspace_move()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.ws_id is distinct from old.ws_id then
    raise exception 'meet attendance workspace is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.meet_attendance_reject_workspace_move()
  from public, anon, authenticated;

drop trigger if exists meet_attendance_sessions_reject_workspace_move
  on private.meet_attendance_sessions;
create trigger meet_attendance_sessions_reject_workspace_move
  before update of ws_id on private.meet_attendance_sessions
  for each row
  execute function private.meet_attendance_reject_workspace_move();

create index if not exists meet_attendance_sessions_meeting_ws_joined_idx
  on private.meet_attendance_sessions (meeting_id, ws_id, joined_at, source_key);

create or replace function private.purge_expired_meet_attendance(
  p_now timestamptz default now()
)
returns integer
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
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job where jobname = 'meet-attendance-retention'
    ) then
      perform cron.unschedule('meet-attendance-retention');
    end if;
    perform cron.schedule(
      'meet-attendance-retention',
      '17 18 * * *',
      $job$select private.purge_expired_meet_attendance()$job$
    );
  end if;
end;
$$;

commit;
