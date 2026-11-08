begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

insert into auth.users(id) values (pg_temp.fid(97001)), (pg_temp.fid(97002));
insert into public.users(id)
values (pg_temp.fid(97001)), (pg_temp.fid(97002))
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values (pg_temp.fid(97011), 'Synthetic tutoring follow-up', false, pg_temp.fid(97001));
insert into public.workspace_members(ws_id, user_id, type)
values
  (pg_temp.fid(97011), pg_temp.fid(97001), 'MEMBER'),
  (pg_temp.fid(97011), pg_temp.fid(97002), 'MEMBER')
on conflict do nothing;
insert into public.user_private_details(user_id, email)
values (pg_temp.fid(97002), 'synthetic-homeroom@example.invalid')
on conflict (user_id) do update set email = excluded.email;
insert into public.workspace_users(id, ws_id, full_name)
values
  (pg_temp.fid(97021), pg_temp.fid(97011), 'Synthetic homeroom teacher'),
  (pg_temp.fid(97022), pg_temp.fid(97011), 'Synthetic learner');
insert into public.workspace_user_groups(id, ws_id, name)
values (pg_temp.fid(97031), pg_temp.fid(97011), 'Synthetic class');
insert into private.workspace_tutoring_sessions(
  id, ws_id, group_id, student_user_id, session_date, start_time, reason_type
)
values (
  pg_temp.fid(97041), pg_temp.fid(97011), pg_temp.fid(97031),
  pg_temp.fid(97022), date '2026-10-20', time '17:00', 'WEAK_SUPPORT'
);

-- Notification types: validated superset, used through the existing mail path.
select ok(
  (select not convalidated from pg_constraint
   where conname = 'notifications_type_check'
     and conrelid = 'public.notifications'::regclass),
  'notification type constraint is NOT VALID: no scan under the exclusive lock'
);
select lives_ok(
  $q$insert into public.notifications(user_id, type, title, scope)
     values (pg_temp.fid(97002), 'mail_received', 'existing type', 'user')$q$,
  'existing notification types are still accepted'
);
select throws_ok(
  $q$insert into public.notifications(user_id, type, title, scope)
     values (pg_temp.fid(97002), 'tutoring_unknown', 'unknown type', 'user')$q$,
  '23514', null,
  'unknown tutoring notification types are rejected'
);

create temporary table created_notifications(kind text, id uuid) on commit drop;
insert into created_notifications
select kind, public.create_notification(
  p_ws_id => pg_temp.fid(97011),
  p_user_id => pg_temp.fid(97002),
  p_type => kind,
  p_title => 'Synthetic tutoring follow-up',
  p_entity_type => 'tutoring_session',
  p_entity_id => pg_temp.fid(97041)
)
from unnest(array[
  'tutoring_weak_content_review_due',
  'tutoring_session_completed'
]) as kinds(kind);

select is(
  (select count(*)::integer from created_notifications where id is not null),
  2,
  'create_notification accepts both tutoring notification types'
);
select is(
  (select count(*)::integer
   from private.notification_delivery_log log
   join created_notifications created on created.id = log.notification_id
   where log.channel = 'email' and log.status = 'pending'),
  2,
  'both tutoring types queue email on the existing notification mail path'
);

-- Optional tutor comment.
select has_column('private', 'workspace_tutoring_sessions', 'tutor_comment',
  'tutoring sessions have an optional tutor comment');
select col_is_null('private', 'workspace_tutoring_sessions', 'tutor_comment',
  'tutor comment is optional');
select lives_ok(
  $q$update private.workspace_tutoring_sessions
     set tutor_comment = repeat('a', 2000) where id = pg_temp.fid(97041)$q$,
  'a 2,000-character tutor comment is accepted'
);
select throws_ok(
  $q$update private.workspace_tutoring_sessions
     set tutor_comment = repeat('a', 2001) where id = pg_temp.fid(97041)$q$,
  '23514', null,
  'tutor comments over 2,000 characters are rejected'
);
select throws_ok(
  $q$update private.workspace_tutoring_sessions
     set tutor_comment = '   ' where id = pg_temp.fid(97041)$q$,
  '23514', null,
  'blank tutor comments are stored as null, not whitespace'
);

-- Deny-by-default access on both new tables.
select ok(
  (select relrowsecurity from pg_class
   where oid = 'private.tutoring_weak_support_reviews'::regclass),
  'review clock has row level security enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'private.tutoring_notification_receipts'::regclass),
  'receipts have row level security enabled'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'private'
     and tablename in (
       'tutoring_weak_support_reviews', 'tutoring_notification_receipts'
     )),
  0,
  'new tables expose no RLS policies'
);
select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated']) as roles(role_name)
    cross join unnest(array[
      'private.tutoring_weak_support_reviews',
      'private.tutoring_notification_receipts'
    ]) as tables(table_name)
    cross join unnest(array[
      'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
    ]) as privileges(privilege_name)
    where has_table_privilege(
      role_name, table_name, privilege_name
    )
  ),
  'public, anon, and authenticated hold no table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'private.tutoring_weak_support_reviews',
      'private.tutoring_notification_receipts'
    ]) as tables(table_name)
    cross join unnest(array['select', 'insert', 'update', 'delete'])
      as privileges(privilege_name)
    where not has_table_privilege('service_role', table_name, privilege_name)
  ),
  'service_role can read and write both tables'
);
select ok(
  not has_table_privilege('service_role', 'private.tutoring_notification_receipts', 'truncate'),
  'service_role cannot truncate receipts'
);

set local role authenticated;
select throws_ok(
  'select * from private.tutoring_notification_receipts',
  '42501', null,
  'authenticated cannot read receipts'
);
select throws_ok(
  $q$insert into private.tutoring_weak_support_reviews(group_id, student_user_id)
     values (pg_temp.fid(97031), pg_temp.fid(97022))$q$,
  '42501', null,
  'authenticated cannot reset the review clock'
);
reset role;

-- Review clock: one row per student and class, bumped by any GVCN action.
insert into private.tutoring_weak_support_reviews(
  group_id, student_user_id, last_reviewed_at
)
values (pg_temp.fid(97031), pg_temp.fid(97022), timestamptz '2026-10-01 00:00+07');

select throws_ok(
  $q$insert into private.tutoring_weak_support_reviews(group_id, student_user_id)
     values (pg_temp.fid(97031), pg_temp.fid(97022))$q$,
  '23505', null,
  'a student has one review clock per class'
);
insert into private.tutoring_weak_support_reviews(
  group_id, student_user_id, last_reviewed_at
)
values (pg_temp.fid(97031), pg_temp.fid(97022), timestamptz '2026-10-15 00:00+07')
on conflict (group_id, student_user_id)
do update set last_reviewed_at = excluded.last_reviewed_at;
select is(
  (select last_reviewed_at from private.tutoring_weak_support_reviews
   where group_id = pg_temp.fid(97031) and student_user_id = pg_temp.fid(97022)),
  timestamptz '2026-10-15 00:00+07',
  'a later GVCN action resets the clock in place'
);

-- Receipts: shape per kind.
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(
       kind, group_id, student_user_id, recipient_user_id)
     values ('weak_content_review_due', pg_temp.fid(97031),
       pg_temp.fid(97022), pg_temp.fid(97002))$q$,
  '23514', null,
  'review receipts require the review cycle start'
);
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(
       kind, tutoring_session_id, group_id, recipient_user_id)
     values ('session_completed', pg_temp.fid(97041),
       pg_temp.fid(97031), pg_temp.fid(97002))$q$,
  '23514', null,
  'completion receipts carry only the session key'
);
select throws_ok(
  $q$insert into private.tutoring_notification_receipts(
       kind, tutoring_session_id, recipient_user_id)
     values ('weak_content_escalation', pg_temp.fid(97041), pg_temp.fid(97002))$q$,
  '23514', null,
  'only the single-step review and completion kinds exist'
);

-- Review alert: one per recipient per unchanged cycle.
create function pg_temp.claim_review(cycle timestamptz, recipient uuid)
returns integer language sql as $$
  with claimed as (
    insert into private.tutoring_notification_receipts(
      kind, group_id, student_user_id, review_cycle_started_at, recipient_user_id
    )
    values (
      'weak_content_review_due', pg_temp.fid(97031), pg_temp.fid(97022),
      cycle, recipient
    )
    on conflict (group_id, student_user_id, review_cycle_started_at, recipient_user_id)
    do nothing
    returning 1
  )
  select count(*)::integer from claimed;
$$;

select is(pg_temp.claim_review(timestamptz '2026-10-15 00:00+07', pg_temp.fid(97002)), 1,
  'first review alert for a cycle is claimed');
select is(pg_temp.claim_review(timestamptz '2026-10-15 00:00+07', pg_temp.fid(97002)), 0,
  'a rerun for the same cycle and recipient claims nothing');
select is(pg_temp.claim_review(timestamptz '2026-10-15 00:00+07', pg_temp.fid(97001)), 1,
  'the office recipient is claimed in the same step');
select is(pg_temp.claim_review(timestamptz '2026-10-29 00:00+07', pg_temp.fid(97002)), 1,
  'a reset review clock starts a new alert cycle');

-- Completion: one per recipient per session.
create function pg_temp.claim_completion(recipient uuid)
returns integer language sql as $$
  with claimed as (
    insert into private.tutoring_notification_receipts(
      kind, tutoring_session_id, recipient_user_id
    )
    values ('session_completed', pg_temp.fid(97041), recipient)
    on conflict (tutoring_session_id, recipient_user_id) do nothing
    returning 1
  )
  select count(*)::integer from claimed;
$$;

select is(pg_temp.claim_completion(pg_temp.fid(97002)), 1,
  'first completion notice is claimed');
select is(pg_temp.claim_completion(pg_temp.fid(97002)), 0,
  'marking the session done again claims nothing');
select is(pg_temp.claim_completion(pg_temp.fid(97001)), 1,
  'every homeroom teacher of the class gets a completion claim');

-- Linked notification deletion keeps the receipt (no re-send).
update private.tutoring_notification_receipts receipt
set notification_id = created.id
from created_notifications created
where created.kind = 'tutoring_session_completed'
  and receipt.kind = 'session_completed'
  and receipt.recipient_user_id = pg_temp.fid(97002);
delete from public.notifications
where id = (select id from created_notifications where kind = 'tutoring_session_completed');
select is(
  (select notification_id from private.tutoring_notification_receipts
   where kind = 'session_completed' and recipient_user_id = pg_temp.fid(97002)),
  null::uuid,
  'deleting the notification keeps the receipt and clears its link'
);
select is(pg_temp.claim_completion(pg_temp.fid(97002)), 0,
  'a deleted notification is not sent again');

-- Lifecycle cascades.
delete from private.workspace_tutoring_sessions where id = pg_temp.fid(97041);
select is(
  (select count(*)::integer from private.tutoring_notification_receipts
   where kind = 'session_completed'),
  0,
  'deleting a tutoring session removes its completion receipts'
);
delete from public.workspace_users where id = pg_temp.fid(97022);
select is(
  (select count(*)::integer from private.tutoring_notification_receipts), 0,
  'deleting the student removes their review receipts'
);
select is(
  (select count(*)::integer from private.tutoring_weak_support_reviews), 0,
  'deleting the student removes their review clock'
);

-- Foreign keys used by cascades are indexed.
select ok(
  not exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid in (
        'private.tutoring_weak_support_reviews'::regclass,
        'private.tutoring_notification_receipts'::regclass
      )
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indkey[0] = c.conkey[1]
      )
  ),
  'every foreign key leads an index'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'private'
     and table_name = 'tutoring_weak_support_reviews'),
  3,
  'review clock stores only the class, student, and last review time'
);

select * from finish();
rollback;
