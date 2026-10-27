-- Rollback for 20261027060200_topic_schedule_slot_unique.sql.
-- Drops the slot uniqueness index and the atomic recipient restore. The
-- editor and clone keep their own slot checks, so only the same-instant race
-- reopens. No data changes. Roll back the editor code that calls
-- private.set_topic_schedule_recipient first.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop index if exists private.topic_announcements_schedule_slot_unique;
drop function if exists private.set_topic_schedule_recipient(uuid, uuid, uuid);

notify pgrst, 'reload schema';

commit;
