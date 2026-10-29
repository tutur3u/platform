begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(4);

select has_index('private', 'topic_announcements',
  'topic_announcements_schedule_stale_claim_idx', 'stale claim index exists');
select ok(
  pg_get_indexdef('private.topic_announcements_schedule_stale_claim_idx'::regclass)
    ~ '\(updated_at\)',
  'stale claim index is on updated_at');
select ok(
  pg_get_indexdef('private.topic_announcements_schedule_stale_claim_idx'::regclass)
    ~ 'source_type = ''schedule''::text'
  and pg_get_indexdef('private.topic_announcements_schedule_stale_claim_idx'::regclass)
    ~ 'status = ''processing''::text'
  and pg_get_indexdef('private.topic_announcements_schedule_stale_claim_idx'::regclass)
    ~ 'scheduled_send_at IS NULL',
  'stale claim index matches the sweep filter');

-- The planner can serve the sweep (the same filter as failStaleScheduleClaims)
-- from the index. Seed rows (rolled back) and analyze so the plan does not
-- depend on whatever statistics the table had before the test.
insert into auth.users (id) values ('7a5f0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.users (id) values ('7a5f0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id) values (
  '7a5f0000-0000-4000-8000-000000000011', 'Sweep plan', false,
  '7a5f0000-0000-4000-8000-000000000001'
);
insert into private.topic_announcements (ws_id, title, topic, status, source_type)
select '7a5f0000-0000-4000-8000-000000000011', 'Session', 'Topic',
  case when n % 50 = 0 then 'processing' else 'draft' end, 'schedule'
from generate_series(1, 500) n;
analyze private.topic_announcements;
create function pg_temp.sweep_plan() returns text
language plpgsql as $$
declare
  plan json;
begin
  execute $sweep$
    explain (format json)
    update private.topic_announcements
    set last_error = 'PROCESSING_TIMEOUT', status = 'failed'
    where source_type = 'schedule'
      and status = 'processing'
      and scheduled_send_at is null
      and updated_at < now() - interval '15 minutes'
  $sweep$ into plan;
  return plan::text;
end;
$$;

set local enable_seqscan = off;
select ok(
  pg_temp.sweep_plan() ~ 'topic_announcements_schedule_stale_claim_idx',
  'the stale claim sweep can use the index');

select * from finish();
rollback;
