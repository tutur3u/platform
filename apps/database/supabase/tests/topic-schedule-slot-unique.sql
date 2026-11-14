begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(24);

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


-- private.set_topic_schedule_recipient: the atomic GVNN restore.
insert into private.topic_announcement_contacts (id, ws_id, email, name, archived) values
  ('7a5e0000-0000-4000-8000-000000000041', '7a5e0000-0000-4000-8000-000000000011',
    'gvnn-a@example.com', 'GVNN A', false),
  ('7a5e0000-0000-4000-8000-000000000042', '7a5e0000-0000-4000-8000-000000000011',
    'gvnn-b@example.com', 'GVNN B', false),
  ('7a5e0000-0000-4000-8000-000000000043', '7a5e0000-0000-4000-8000-000000000012',
    'gvnn-other@example.com', 'Other workspace', false);
insert into private.topic_announcements
  (id, ws_id, group_id, title, topic, status, source_type, session_date, start_time)
values ('7a5e0000-0000-4000-8000-000000000051', '7a5e0000-0000-4000-8000-000000000011',
  '7a5e0000-0000-4000-8000-000000000022', 'Session', 'Topic', 'draft', 'schedule',
  '2026-11-17', '17:30');

create function pg_temp.recipients() returns text[] language sql as $$
  select coalesce(array_agg(contact_id::text order by contact_id), '{}')
  from private.topic_announcement_recipients
  where announcement_id = '7a5e0000-0000-4000-8000-000000000051';
$$;
create function pg_temp.set_recipient(p_ws uuid, p_contact uuid) returns text
language sql as $$
  select private.set_topic_schedule_recipient(
    '7a5e0000-0000-4000-8000-000000000051', p_ws, p_contact);
$$;

select has_function('private', 'set_topic_schedule_recipient',
  array['uuid', 'uuid', 'uuid'], 'atomic recipient restore exists');
select ok(
  (select not prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp']
    from pg_proc
    where oid = 'private.set_topic_schedule_recipient(uuid, uuid, uuid)'::regprocedure),
  'recipient restore is security invoker with a pinned search path');
select ok(
  not has_function_privilege('anon',
    'private.set_topic_schedule_recipient(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'private.set_topic_schedule_recipient(uuid, uuid, uuid)', 'execute')
  and has_function_privilege('service_role',
    'private.set_topic_schedule_recipient(uuid, uuid, uuid)', 'execute'),
  'only service_role may restore recipients');

select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011',
  '7a5e0000-0000-4000-8000-000000000041'), 'set', 'an editable session gets the GVNN');
select is(pg_temp.recipients(), array['7a5e0000-0000-4000-8000-000000000041'],
  'exactly one recipient');

update private.topic_announcement_contacts set archived = true
where id = '7a5e0000-0000-4000-8000-000000000042';
select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011',
  '7a5e0000-0000-4000-8000-000000000042'), 'contact_unavailable',
  'an archived contact is refused');
select is(pg_temp.recipients(), array['7a5e0000-0000-4000-8000-000000000041'],
  'and the current recipient stays (never none)');
select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011',
  '7a5e0000-0000-4000-8000-000000000043'), 'contact_unavailable',
  'a contact from another workspace is refused');

update private.topic_announcements set status = 'processing'
where id = '7a5e0000-0000-4000-8000-000000000051';
select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011', null),
  'locked', 'a claimed session is not rewritten');
select is(pg_temp.recipients(), array['7a5e0000-0000-4000-8000-000000000041'],
  'a claimed session keeps the recipient the send read');

update private.topic_announcements set status = 'draft', sent_at = now()
where id = '7a5e0000-0000-4000-8000-000000000051';
select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011', null),
  'locked', 'a sent session is not rewritten');

update private.topic_announcements set sent_at = null
where id = '7a5e0000-0000-4000-8000-000000000051';
select is(pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000012', null),
  'not_found', 'another workspace cannot touch the session');
select ok(
  pg_temp.set_recipient('7a5e0000-0000-4000-8000-000000000011', null) = 'set'
    and pg_temp.recipients() = '{}',
  'restoring "no GVNN" removes the recipient');

select * from finish();
rollback;
