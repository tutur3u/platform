begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(11);

insert into auth.users (id) values ('7a5e0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.users (id) values ('7a5e0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('7a5e0000-0000-4000-8000-000000000011', 'Slot A', false,
    '7a5e0000-0000-4000-8000-000000000001'),
  ('7a5e0000-0000-4000-8000-000000000012', 'Slot B', false,
    '7a5e0000-0000-4000-8000-000000000001');
insert into public.workspace_user_groups (id, ws_id, name) values
  ('7a5e0000-0000-4000-8000-000000000021',
    '7a5e0000-0000-4000-8000-000000000011', 'Kids 1A'),
  ('7a5e0000-0000-4000-8000-000000000022',
    '7a5e0000-0000-4000-8000-000000000011', 'Kids 2B'),
  ('7a5e0000-0000-4000-8000-000000000023',
    '7a5e0000-0000-4000-8000-000000000012', 'Other class');

create function pg_temp.session(
  p_ws uuid, p_group uuid, p_date date, p_start time,
  p_status text default 'draft', p_source text default 'schedule'
) returns void language sql as $$
  insert into private.topic_announcements
    (ws_id, group_id, title, topic, status, source_type, session_date, start_time)
  values (
    p_ws, p_group, 'Session',
    -- Only drafts may have no topic yet (topic_announcements_topic_ready_check).
    case when p_status = 'draft' then null else 'Topic' end,
    p_status, p_source, p_date, p_start
  );
$$;

select has_index('private', 'topic_announcements',
  'topic_announcements_schedule_slot_unique', 'slot index exists');
select ok(
  (select indisunique from pg_index
    where indexrelid = 'private.topic_announcements_schedule_slot_unique'::regclass),
  'slot index is unique');
select ok(
  pg_get_indexdef('private.topic_announcements_schedule_slot_unique'::regclass)
    ~ 'source_type = ''schedule''::text'
  and pg_get_indexdef('private.topic_announcements_schedule_slot_unique'::regclass)
    ~ 'status <> ''cancelled''::text',
  'slot index only covers non-cancelled schedule sessions');

select lives_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000021',
  '2026-11-10', '17:30')$$, 'a session takes its slot');
select throws_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000021',
  '2026-11-10', '17:30')$$, '23505', null, 'a second session in the slot is refused');
select lives_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000021',
  '2026-11-10', '17:30', 'cancelled')$$, 'a cancelled session does not hold the slot');
select lives_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000021',
  '2026-11-10', '18:00')$$, 'another start time is a different slot');
select lives_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000022',
  '2026-11-10', '17:30')$$, 'another class is a different slot');
select lives_ok($$
  select pg_temp.session('7a5e0000-0000-4000-8000-000000000011',
    '7a5e0000-0000-4000-8000-000000000021', '2026-11-10', '17:30', 'draft', 'manual');
  select pg_temp.session('7a5e0000-0000-4000-8000-000000000011',
    '7a5e0000-0000-4000-8000-000000000021', '2026-11-10', '17:30', 'draft', 'manual')
$$, 'other announcement sources are not constrained');

update private.topic_announcements set status = 'cancelled', topic = 'Topic'
where source_type = 'schedule' and status = 'draft'
  and group_id = '7a5e0000-0000-4000-8000-000000000021'
  and start_time = '17:30';
select lives_ok($$select pg_temp.session(
  '7a5e0000-0000-4000-8000-000000000011', '7a5e0000-0000-4000-8000-000000000021',
  '2026-11-10', '17:30')$$, 'removing a session frees its slot again');
select throws_ok($$
  update private.topic_announcements set status = 'draft'
  where source_type = 'schedule' and status = 'cancelled'
    and group_id = '7a5e0000-0000-4000-8000-000000000021'
    and start_time = '17:30'
$$, '23505', null, 'restoring a removed session into a taken slot is refused');

select * from finish();
rollback;
