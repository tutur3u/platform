-- Roll back before the concurrent index migration. Restore application callers first.
begin;
set local lock_timeout = '5s';
drop function if exists private.set_topic_schedule_recipient(uuid, uuid, uuid);
notify pgrst, 'reload schema';
commit;
