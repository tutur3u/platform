-- Rollback proof for 20261027010100_topic_schedule_slot_unique.sql.
-- Run ONLY against a disposable local stack, after the rollback file.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
select plan(2);

select hasnt_index('private', 'topic_announcements',
  'topic_announcements_schedule_slot_unique',
  'rollback drops the schedule slot uniqueness index');
select hasnt_function('private', 'set_topic_schedule_recipient',
  array['uuid', 'uuid', 'uuid'],
  'rollback drops the atomic recipient restore');

select * from finish();
rollback;
