-- Rollback for 20261027010100_topic_schedule_slot_unique.sql.
-- Drops the slot uniqueness index. The editor and clone keep their own slot
-- checks, so only the same-instant race reopens. No data changes.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop index if exists private.topic_announcements_schedule_slot_unique;

notify pgrst, 'reload schema';

commit;
