begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): Unschedules only the fixed attendance-retention job if present. No dynamic command text or grants.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job where jobname = 'meet-attendance-retention'
    ) then
      perform cron.unschedule('meet-attendance-retention');
    end if;
  end if;
end;
$$;

drop trigger if exists meet_attendance_sessions_reject_workspace_move
  on private.meet_attendance_sessions;
drop function if exists private.meet_attendance_reject_workspace_move();
drop function if exists private.purge_expired_meet_attendance(timestamptz);
drop index if exists private.meet_attendance_sessions_meeting_ws_joined_idx;

commit;
