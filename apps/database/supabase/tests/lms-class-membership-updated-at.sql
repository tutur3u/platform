begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;

select plan(13);

-- Represent rows from before the timestamp triggers on this disposable fixture.
alter table public.workspace_user_groups disable trigger stamp_class_updated_at;
alter table public.workspace_user_groups_users disable trigger stamp_class_membership_updated_at;

insert into public.users (id) values ('00000000-0000-0000-0000-000000072001');

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000072010', 'LMS Class Timestamp Fixture', false,
  '00000000-0000-0000-0000-000000072001'
);

insert into public.workspace_users (id, ws_id, display_name)
values
  ('00000000-0000-0000-0000-000000072201', '00000000-0000-0000-0000-000000072010', 'Existing contact'),
  ('00000000-0000-0000-0000-000000072202', '00000000-0000-0000-0000-000000072010', 'New contact');

insert into public.workspace_user_groups (id, ws_id, name)
values ('00000000-0000-0000-0000-000000072101', '00000000-0000-0000-0000-000000072010', 'Existing class');

insert into public.workspace_user_groups_users (group_id, user_id, role, created_at)
values (
  '00000000-0000-0000-0000-000000072101', '00000000-0000-0000-0000-000000072201',
  'STUDENT', '2026-01-15 08:00:00+07'
);

alter table public.workspace_user_groups enable trigger stamp_class_updated_at;
alter table public.workspace_user_groups_users enable trigger stamp_class_membership_updated_at;

select is(
  (select updated_at from public.workspace_user_groups where id = '00000000-0000-0000-0000-000000072101'),
  null::timestamptz,
  'adding the timestamp leaves an existing class untouched'
);

select is(
  (select updated_at from public.workspace_user_groups_users where user_id = '00000000-0000-0000-0000-000000072201'),
  null::timestamptz,
  'adding the timestamp leaves an existing membership untouched'
);

select ok(
  not exists (
    select 1 from (values ('anon'), ('authenticated'), ('service_role')) as callers(role_name)
    where has_function_privilege(role_name, 'private.stamp_class_membership_updated_at()', 'EXECUTE')
  ),
  'API roles cannot invoke the trigger function directly'
);

insert into public.workspace_user_groups (id, ws_id, name, updated_at)
values ('00000000-0000-0000-0000-000000072102', '00000000-0000-0000-0000-000000072010', 'New class', '2099-01-01');

insert into public.workspace_user_groups_users (group_id, user_id, role, updated_at)
values (
  '00000000-0000-0000-0000-000000072102', '00000000-0000-0000-0000-000000072202',
  'STUDENT', '2099-01-01'
);

create temporary table initial_class_stamps as
select c.updated_at as class_stamp, m.updated_at as membership_stamp
from public.workspace_user_groups c join public.workspace_user_groups_users m on m.group_id = c.id
where c.id = '00000000-0000-0000-0000-000000072102';

select ok((select class_stamp between transaction_timestamp() and clock_timestamp() from initial_class_stamps),
  'the database replaces a supplied class timestamp on insert');

select ok((select membership_stamp between transaction_timestamp() and clock_timestamp() from initial_class_stamps),
  'the database replaces a supplied membership timestamp on insert');

update public.workspace_user_groups set updated_at = '2099-01-01'
where id = '00000000-0000-0000-0000-000000072102';

update public.workspace_user_groups_users set role = role, updated_at = null
where user_id = '00000000-0000-0000-0000-000000072202';

select is(
  (select updated_at from public.workspace_user_groups where id = '00000000-0000-0000-0000-000000072102'),
  (select class_stamp from initial_class_stamps),
  'timestamp-only edits cannot change a class timestamp'
);

select is(
  (select updated_at from public.workspace_user_groups_users where user_id = '00000000-0000-0000-0000-000000072202'),
  (select membership_stamp from initial_class_stamps),
  'timestamp-only edits and no-op role replay cannot change a membership timestamp'
);

update public.workspace_user_groups set is_course_published = true
where id in ('00000000-0000-0000-0000-000000072101', '00000000-0000-0000-0000-000000072102');

select ok(
  (select updated_at is not null from public.workspace_user_groups where id = '00000000-0000-0000-0000-000000072101'),
  'publishing an existing class assigns its first timestamp'
);

select cmp_ok(
  (select updated_at from public.workspace_user_groups where id = '00000000-0000-0000-0000-000000072102'),
  '>', (select class_stamp from initial_class_stamps),
  'publishing a timestamped class advances its timestamp'
);

do $$ begin
  perform private.admin_upsert_workspace_user_group_members_with_audit_actor(
    '00000000-0000-0000-0000-000000072010', '00000000-0000-0000-0000-000000072101',
    array['00000000-0000-0000-0000-000000072201'::uuid], 'TEACHER', '00000000-0000-0000-0000-000000072001'
  );
end $$;

select ok(
  (select updated_at is not null and role = 'TEACHER' from public.workspace_user_groups_users
   where user_id = '00000000-0000-0000-0000-000000072201'),
  'the existing Contacts membership manager still changes role and assigns the first timestamp'
);

select is(
  (select created_at from public.workspace_user_groups_users where user_id = '00000000-0000-0000-0000-000000072201'),
  '2026-01-15 08:00:00+07'::timestamptz,
  'the existing Contacts membership manager preserves the original join timestamp'
);

update public.workspace_user_groups_users set role = 'TEACHER', updated_at = '2099-01-01'
where user_id = '00000000-0000-0000-0000-000000072202';

select cmp_ok(
  (select updated_at from public.workspace_user_groups_users where user_id = '00000000-0000-0000-0000-000000072202'),
  '>', (select membership_stamp from initial_class_stamps),
  'editing a timestamped membership advances its timestamp'
);

select ok(
  (select updated_at < '2099-01-01'::timestamptz from public.workspace_user_groups_users
   where user_id = '00000000-0000-0000-0000-000000072202'),
  'a legitimate write cannot supply its own timestamp'
);

select * from finish();
rollback;
