begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(31);

insert into auth.users (id) values
  ('7a5c0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.users (id)
values ('7a5c0000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  ('7a5c0000-0000-4000-8000-000000000011', 'Topic teacher A', false,
    '7a5c0000-0000-4000-8000-000000000001'),
  ('7a5c0000-0000-4000-8000-000000000012', 'Topic teacher B', false,
    '7a5c0000-0000-4000-8000-000000000001');

insert into public.workspace_users (id, ws_id, full_name, display_name) values
  ('7a5c0000-0000-4000-8000-000000000021',
    '7a5c0000-0000-4000-8000-000000000011', 'Teacher A', 'Teacher A'),
  ('7a5c0000-0000-4000-8000-000000000022',
    '7a5c0000-0000-4000-8000-000000000011', 'Teacher A2', 'Teacher A2'),
  ('7a5c0000-0000-4000-8000-000000000023',
    '7a5c0000-0000-4000-8000-000000000012', 'Teacher B', 'Teacher B');

-- Columns and comments.
select has_column('private', 'topic_announcements', 'teacher_workspace_user_id',
  'teacher_workspace_user_id exists');
select col_type_is('private', 'topic_announcements', 'teacher_workspace_user_id',
  'uuid', 'teacher_workspace_user_id is uuid');
select col_type_is('private', 'topic_announcements', 'course_book', 'text',
  'course_book is text');
select col_type_is('private', 'topic_announcements', 'video_url', 'text',
  'video_url is text');
select col_type_is('private', 'topic_announcements', 'send_due_at',
  'timestamp with time zone', 'send_due_at is timestamptz');
select col_is_null('private', 'topic_announcements', 'topic',
  'topic is nullable while a draft');
select fk_ok('private', 'topic_announcements', 'teacher_workspace_user_id',
  'public', 'workspace_users', 'id',
  'teacher_workspace_user_id references workspace_users');

-- Topic is optional only for drafts.
select lives_ok($$
  insert into private.topic_announcements (id, ws_id, title, topic, status)
  values ('7a5c0000-0000-4000-8000-000000000031',
    '7a5c0000-0000-4000-8000-000000000011', 'Session 1', null, 'draft')
$$, 'a draft may have no topic');
select lives_ok($$
  insert into private.topic_announcements (id, ws_id, title, topic, status)
  values ('7a5c0000-0000-4000-8000-000000000032',
    '7a5c0000-0000-4000-8000-000000000011', 'Session 2', '   ', 'draft')
$$, 'a draft may have a blank topic');
select throws_ok($$
  insert into private.topic_announcements (ws_id, title, topic, status)
  values ('7a5c0000-0000-4000-8000-000000000011', 'Session 3', null, 'queued')
$$, '23514', null, 'a queued announcement requires a topic');
select throws_ok($$
  insert into private.topic_announcements (ws_id, title, topic, status)
  values ('7a5c0000-0000-4000-8000-000000000011', 'Session 4', '  ', 'sent')
$$, '23514', null, 'a sent announcement requires a non-blank topic');
select throws_ok($$
  update private.topic_announcements
  set status = 'processing'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', null, 'a draft without a topic cannot leave draft status');
select lives_ok($$
  update private.topic_announcements
  set topic = 'Animals', status = 'queued'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, 'a draft with a topic can be queued');

-- Course book and video link bounds.
select lives_ok($$
  update private.topic_announcements
  set course_book = repeat('b', 200),
      video_url = 'https://www.youtube.com/watch?v=abc123',
      send_due_at = now() - interval '1 hour'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, 'course book, https video link and send deadline are accepted');
select throws_ok($$
  update private.topic_announcements set course_book = repeat('b', 201)
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', null, 'course book is limited to 200 characters');
select throws_ok($$
  update private.topic_announcements set video_url = 'http://example.com/v'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', null, 'video link must use https');
select throws_ok($$
  update private.topic_announcements set video_url = 'https://example.com/a b'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', null, 'video link cannot contain whitespace');
select throws_ok($$
  update private.topic_announcements
  set video_url = 'https://example.com/' || repeat('v', 2000)
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', null, 'video link is limited to 2000 characters');

-- Teacher must belong to the announcement workspace.
select lives_ok($$
  update private.topic_announcements
  set teacher_workspace_user_id = '7a5c0000-0000-4000-8000-000000000021'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, 'a same-workspace teacher can be assigned');
select throws_ok($$
  update private.topic_announcements
  set teacher_workspace_user_id = '7a5c0000-0000-4000-8000-000000000023'
  where id = '7a5c0000-0000-4000-8000-000000000032'
$$, '23514', 'teacher_workspace_user_id does not belong to ws_id',
  'a teacher from another workspace is rejected on update');
select throws_ok($$
  insert into private.topic_announcements (
    ws_id, title, topic, status, teacher_workspace_user_id
  )
  values ('7a5c0000-0000-4000-8000-000000000011', 'Session 5', null, 'draft',
    '7a5c0000-0000-4000-8000-000000000023')
$$, '23514', 'teacher_workspace_user_id does not belong to ws_id',
  'a teacher from another workspace is rejected on insert');
select throws_ok($$
  update private.topic_announcements
  set ws_id = '7a5c0000-0000-4000-8000-000000000012'
  where id = '7a5c0000-0000-4000-8000-000000000031'
$$, '23514', 'teacher_workspace_user_id does not belong to ws_id',
  'moving an announcement away from its teacher workspace is rejected');

delete from public.workspace_users
where id = '7a5c0000-0000-4000-8000-000000000021';
select is(
  (select teacher_workspace_user_id from private.topic_announcements
   where id = '7a5c0000-0000-4000-8000-000000000031'),
  null::uuid,
  'deleting the teacher clears the assignment'
);

-- Indexes for teacher assignment and late-status filters.
select is(
  (select indexdef from pg_indexes
   where schemaname = 'private'
     and indexname = 'topic_announcements_teacher_session_idx'),
  'CREATE INDEX topic_announcements_teacher_session_idx ON private.topic_announcements USING btree (teacher_workspace_user_id, ws_id, session_date) WHERE (teacher_workspace_user_id IS NOT NULL)',
  'teacher assignment index is partial on assigned rows'
);
select is(
  (select indexdef from pg_indexes
   where schemaname = 'private'
     and indexname = 'topic_announcements_ws_send_due_idx'),
  'CREATE INDEX topic_announcements_ws_send_due_idx ON private.topic_announcements USING btree (ws_id, send_due_at) WHERE (send_due_at IS NOT NULL)',
  'send deadline index is partial on rows with a deadline'
);

-- The trigger function is not callable by API roles.
select ok(
  not has_function_privilege('anon',
    'private.topic_announcements_teacher_same_workspace()', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.topic_announcements_teacher_same_workspace()', 'EXECUTE'),
  'anon and authenticated cannot execute the teacher scope trigger function'
);

-- Notification type list is extended, not replaced.
select ok(
  (select convalidated from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check'),
  'notifications_type_check is validated'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check')) like '%''topic_assigned''%',
  'notifications_type_check allows topic_assigned'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check')) like '%''mail_received''%'
  and pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check')) like '%''task_assigned''%',
  'notifications_type_check keeps the existing types'
);
select throws_ok($$
  insert into public.notifications (ws_id, user_id, type, title)
  values ('7a5c0000-0000-4000-8000-000000000011',
    '7a5c0000-0000-4000-8000-000000000001', 'topic_unknown', 'Unknown')
$$, '23514', null, 'unknown notification types are still rejected');
select lives_ok($$
  insert into public.notifications (ws_id, user_id, type, title)
  values ('7a5c0000-0000-4000-8000-000000000011',
    '7a5c0000-0000-4000-8000-000000000001', 'topic_assigned',
    'Topic assigned')
$$, 'topic_assigned notifications can be stored');

select * from finish();

rollback;
