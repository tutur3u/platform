begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop trigger if exists meet_attendance_sessions_reject_meeting_move
  on private.meet_attendance_sessions;
drop function if exists private.meet_attendance_reject_meeting_move();
drop table if exists private.meet_attendance_fences;

commit;
