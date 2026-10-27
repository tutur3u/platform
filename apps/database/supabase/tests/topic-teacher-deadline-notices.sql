begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(30);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values (
  '7a5d0000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'deadline-teacher@example.com', now(), now(), now()
)
on conflict do nothing;
insert into public.users (id)
values ('7a5d0000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.user_private_details (user_id, email)
values ('7a5d0000-0000-4000-8000-000000000001', 'deadline-teacher@example.com')
on conflict (user_id) do update set email = excluded.email;

insert into public.workspaces (id, name, personal, creator_id) values (
  '7a5d0000-0000-4000-8000-000000000011', 'Deadline notices', false,
  '7a5d0000-0000-4000-8000-000000000001'
);
insert into public.workspace_members (ws_id, user_id) values (
  '7a5d0000-0000-4000-8000-000000000011',
  '7a5d0000-0000-4000-8000-000000000001'
)
on conflict do nothing;

insert into private.topic_announcements (id, ws_id, title, topic, status) values (
  '7a5d0000-0000-4000-8000-000000000031',
  '7a5d0000-0000-4000-8000-000000000011', 'Kids 1A 2026-11-10 17:30', null,
  'draft'
);

-- Schema, privileges and comments.
select has_table('private', 'topic_announcement_teacher_notices',
  'deadline notice receipts exist');
select col_is_pk('private', 'topic_announcement_teacher_notices',
  array['announcement_id', 'kind', 'send_due_at'],
  'one receipt per announcement, kind and send_due_at');
select col_type_is('private', 'topic_announcement_teacher_notices',
  'send_due_at', 'timestamp with time zone', 'send_due_at is timestamptz');
select ok(
  (select relrowsecurity from pg_class
    where oid = 'private.topic_announcement_teacher_notices'::regclass),
  'row level security is enabled'
);
select ok(
  not has_table_privilege('anon', 'private.topic_announcement_teacher_notices', 'select')
    and not has_table_privilege('authenticated', 'private.topic_announcement_teacher_notices', 'select')
    and not has_table_privilege('authenticated', 'private.topic_announcement_teacher_notices', 'insert'),
  'anon and authenticated cannot read or write receipts'
);
select ok(
  has_table_privilege('service_role', 'private.topic_announcement_teacher_notices', 'insert')
    and has_table_privilege('service_role', 'private.topic_announcement_teacher_notices', 'update'),
  'service_role can claim and update receipts'
);
select isnt(
  obj_description('private.topic_announcement_teacher_notices'::regclass, 'pg_class'),
  null,
  'receipts table is documented'
);

-- Notification types.
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check')
  ) ~ 'topic_due_soon' and pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check')
  ) ~ 'topic_late',
  'both deadline types are allowed'
);
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check')
  ) ~ 'topic_assigned',
  'existing types are kept'
);
select ok(
  not (select convalidated from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check'),
  'type check stays NOT VALID (no scan under ACCESS EXCLUSIVE)'
);

-- should_send_notification: the deadline types never use the email channel.
select is(
  public.should_send_notification(
    '7a5d0000-0000-4000-8000-000000000001', 'topic_due_soon', 'email',
    'workspace', '7a5d0000-0000-4000-8000-000000000011'),
  false, 'topic_due_soon has no notification email');
select is(
  public.should_send_notification(
    '7a5d0000-0000-4000-8000-000000000001', 'topic_late', 'email',
    'workspace', '7a5d0000-0000-4000-8000-000000000011'),
  false, 'topic_late has no notification email');
select is(
  public.should_send_notification(
    '7a5d0000-0000-4000-8000-000000000001', 'topic_late', 'web',
    'workspace', '7a5d0000-0000-4000-8000-000000000011'),
  true, 'topic_late still shows in-app');
select is(
  public.should_send_notification(
    '7a5d0000-0000-4000-8000-000000000001', 'topic_assigned', 'email',
    'workspace', '7a5d0000-0000-4000-8000-000000000011'),
  true, 'other types keep their email default');
select ok(
  (select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp']
    from pg_proc
    where oid = 'public.should_send_notification(uuid, text, text, public.notification_scope, uuid)'::regprocedure),
  'should_send_notification keeps security definer and the pinned pg_catalog, pg_temp search_path'
);
select ok(
  not has_function_privilege('authenticated',
    'public.should_send_notification(uuid, text, text, public.notification_scope, uuid)', 'execute')
    and has_function_privilege('service_role',
    'public.should_send_notification(uuid, text, text, public.notification_scope, uuid)', 'execute'),
  'should_send_notification stays service-role only'
);

-- create_notification: in-app only for the deadline types (no digest email),
-- unchanged for the others.
create temporary table deadline_notifications (kind text, id uuid);
insert into deadline_notifications
select 'late', public.create_notification(
  p_ws_id => '7a5d0000-0000-4000-8000-000000000011',
  p_user_id => '7a5d0000-0000-4000-8000-000000000001',
  p_type => 'topic_late',
  p_title => 'A session topic is late',
  p_entity_type => 'topic_announcement',
  p_entity_id => '7a5d0000-0000-4000-8000-000000000031'
);
insert into deadline_notifications
select 'due_soon', public.create_notification(
  p_ws_id => '7a5d0000-0000-4000-8000-000000000011',
  p_user_id => '7a5d0000-0000-4000-8000-000000000001',
  p_type => 'topic_due_soon',
  p_title => 'A session topic is due soon',
  p_entity_type => 'topic_announcement',
  p_entity_id => '7a5d0000-0000-4000-8000-000000000031'
);
insert into deadline_notifications
select 'assigned', public.create_notification(
  p_ws_id => '7a5d0000-0000-4000-8000-000000000011',
  p_user_id => '7a5d0000-0000-4000-8000-000000000001',
  p_type => 'topic_assigned',
  p_title => 'A session topic was assigned to you',
  p_entity_type => 'topic_announcement',
  p_entity_id => '7a5d0000-0000-4000-8000-000000000031'
);

select is(
  (select count(*)::int from public.notifications n
    join deadline_notifications d on d.id = n.id
    where d.kind in ('late', 'due_soon')),
  2, 'deadline notices create the in-app notification');
select is(
  (select count(*)::int from private.notification_delivery_log l
    join deadline_notifications d on d.id = l.notification_id
    where d.kind in ('late', 'due_soon') and l.channel = 'email'),
  0, 'deadline notices queue no digest email (the sender emails directly)');
select is(
  (select count(*)::int from private.notification_delivery_log l
    join deadline_notifications d on d.id = l.notification_id
    where d.kind = 'assigned' and l.channel = 'email'),
  1, 'topic_assigned still queues its email');

-- Receipts: claim once per send_due_at, re-armed by a new send_due_at.
select lives_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id, notification_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'late',
      '2026-11-09 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001',
      (select id from deadline_notifications where kind = 'late'))$$,
  'a late notice is claimed');
select throws_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'late',
      '2026-11-09 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001')$$,
  '23505', null, 'the same notice cannot be claimed twice');
select lives_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'late',
      '2026-11-09 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001')
    on conflict do nothing$$,
  'a rerun claim is a no-op (the count below stays at one late notice)');
select lives_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'late',
      '2026-11-16 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001')$$,
  'a new send_due_at re-arms the notice');
select lives_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'due_soon',
      '2026-11-09 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001')$$,
  'the due-soon notice is independent of the late one');
select throws_ok(
  $$insert into private.topic_announcement_teacher_notices
      (announcement_id, ws_id, kind, send_due_at, recipient_user_id)
    values ('7a5d0000-0000-4000-8000-000000000031',
      '7a5d0000-0000-4000-8000-000000000011', 'reminder',
      '2026-11-09 10:30:00+00', '7a5d0000-0000-4000-8000-000000000001')$$,
  '23514', null, 'unknown kinds are rejected');
select throws_ok(
  $$update private.topic_announcement_teacher_notices set attempts = 3
    where kind = 'due_soon'$$,
  '23514', null, 'attempts are bounded at 2');

-- Deleting a notification keeps the receipt (and so the dedupe).
delete from public.notifications
  where id = (select id from deadline_notifications where kind = 'late');
select is(
  (select notification_id from private.topic_announcement_teacher_notices
    where kind = 'late' and send_due_at = '2026-11-09 10:30:00+00'),
  null, 'deleting the notification keeps the receipt');
select is(
  (select count(*)::int from private.topic_announcement_teacher_notices
    where announcement_id = '7a5d0000-0000-4000-8000-000000000031'),
  3, 'receipts persist for the announcement');

-- Deleting the announcement removes its receipts.
delete from private.topic_announcements
  where id = '7a5d0000-0000-4000-8000-000000000031';
select is(
  (select count(*)::int from private.topic_announcement_teacher_notices
    where announcement_id = '7a5d0000-0000-4000-8000-000000000031'),
  0, 'receipts cascade with the announcement');
select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'private'
      and tablename = 'topic_announcement_teacher_notices'),
  6, 'primary key plus five supporting indexes');

select * from finish();
rollback;
