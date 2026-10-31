-- Rollback proof for 20261029041100_topic_schedule_stale_claim_index.sql.
-- Run ONLY against a disposable local stack, after the rollback file.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
select plan(1);

select hasnt_index('private', 'topic_announcements',
  'topic_announcements_schedule_stale_claim_idx',
  'rollback drops the stale schedule claim index');

select * from finish();
rollback;
