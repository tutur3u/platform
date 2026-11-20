begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Account deletion must not depend on Meet attendance storage. Attendance can
-- be off, and its private tables can be locked or unavailable; neither may
-- block or fail an auth delete. The Cloudflare erasure job reconciles a
-- recorded account intent after the delete instead, and only accounts with a
-- recorded intent are read.
drop trigger if exists meet_attendance_confirm_account_erasure on auth.users;
drop function if exists private.confirm_meet_attendance_account_erasure();

commit;
