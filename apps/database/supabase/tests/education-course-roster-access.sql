-- A learner who is a plain workspace member can read courses and rosters
-- but cannot enrol themselves, edit a course or remove anyone. Group
-- permissions keep the Teach course routes and roster RPCs working.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  ('c1940000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'roster-owner@example.com', now(), now(), now()),
  ('c1940000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'roster-learner@example.com', now(), now(), now()),
  ('c1940000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'roster-creator@example.com', now(), now(), now()),
  ('c1940000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'roster-teacher@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1940000-0000-4000-8000-000000000001', 'Roster Owner'),
  ('c1940000-0000-4000-8000-000000000002', 'Roster Learner'),
  ('c1940000-0000-4000-8000-000000000003', 'Roster Creator'),
  ('c1940000-0000-4000-8000-000000000004', 'Roster Teacher')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  'c1940000-0000-4000-8000-000000000010',
  'Roster Workspace',
  false,
  'c1940000-0000-4000-8000-000000000001'
);

-- New workspaces default every MEMBER to admin; a school turns that off.
update public.workspace_default_permissions
set enabled = false
where ws_id = 'c1940000-0000-4000-8000-000000000010'
  and permission = 'admin';

insert into public.workspace_members (ws_id, user_id, type)
values
  ('c1940000-0000-4000-8000-000000000010', 'c1940000-0000-4000-8000-000000000002', 'MEMBER'),
  ('c1940000-0000-4000-8000-000000000010', 'c1940000-0000-4000-8000-000000000003', 'MEMBER'),
  ('c1940000-0000-4000-8000-000000000010', 'c1940000-0000-4000-8000-000000000004', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name)
values
  ('c1940000-0000-4000-8000-000000000011', 'c1940000-0000-4000-8000-000000000010', 'Course creators'),
  ('c1940000-0000-4000-8000-000000000012', 'c1940000-0000-4000-8000-000000000010', 'Teachers');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('c1940000-0000-4000-8000-000000000010', 'c1940000-0000-4000-8000-000000000011', 'create_user_groups', true),
  ('c1940000-0000-4000-8000-000000000010', 'c1940000-0000-4000-8000-000000000012', 'update_user_groups', true);

insert into public.workspace_role_members (role_id, user_id)
values
  ('c1940000-0000-4000-8000-000000000011', 'c1940000-0000-4000-8000-000000000003'),
  ('c1940000-0000-4000-8000-000000000012', 'c1940000-0000-4000-8000-000000000004');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values
  ('c1940000-0000-4000-8000-000000000020', 'c1940000-0000-4000-8000-000000000010', 'Enrolled course', true),
  ('c1940000-0000-4000-8000-000000000021', 'c1940000-0000-4000-8000-000000000010', 'Paid course', true);

create temp table roster_people on commit drop as
select
  max(link.virtual_user_id::text) filter (
    where link.platform_user_id = 'c1940000-0000-4000-8000-000000000002'
  )::uuid as learner,
  max(link.virtual_user_id::text) filter (
    where link.platform_user_id = 'c1940000-0000-4000-8000-000000000004'
  )::uuid as teacher
from public.workspace_user_linked_users as link
where link.ws_id = 'c1940000-0000-4000-8000-000000000010';
grant select on roster_people to authenticated;

-- The course name index calls a private helper that client roles cannot
-- execute, so client inserts and renames already fail before this policy.
-- Grant it inside this rolled-back transaction to observe RLS alone.
grant usage on schema private to authenticated;
grant execute on function private.normalize_user_group_search_text(text)
  to authenticated;

insert into public.workspace_user_groups_users (group_id, user_id, role)
select 'c1940000-0000-4000-8000-000000000020', roster_people.learner, 'STUDENT'
from roster_people;

select ok(
  (select learner is not null and teacher is not null from roster_people),
  'the learner and teacher have workspace users'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1940000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);

select is(
  (select count(*)::integer from public.workspace_user_groups where ws_id = 'c1940000-0000-4000-8000-000000000010'),
  2,
  'a learner still reads the courses'
);
select is(
  (
    select count(*)::integer
    from public.workspace_user_groups_users
    where group_id = 'c1940000-0000-4000-8000-000000000020'
  ),
  1,
  'a learner still reads the roster'
);
select throws_ok(
  $$insert into public.workspace_user_groups_users (group_id, user_id, role)
    select 'c1940000-0000-4000-8000-000000000021', learner, 'STUDENT'
    from roster_people$$,
  '42501',
  'new row violates row-level security policy for table "workspace_user_groups_users"',
  'a learner cannot enrol themselves'
);
select lives_ok(
  $$update public.workspace_user_groups_users
    set role = 'TEACHER'
    where group_id = 'c1940000-0000-4000-8000-000000000020'$$,
  'a learner role change runs'
);
select lives_ok(
  $$delete from public.workspace_user_groups_users
    where group_id = 'c1940000-0000-4000-8000-000000000020'$$,
  'a learner roster delete runs'
);
select throws_ok(
  $$insert into public.workspace_user_groups (ws_id, name)
    values ('c1940000-0000-4000-8000-000000000010', 'Learner course')$$,
  '42501',
  'new row violates row-level security policy for table "workspace_user_groups"',
  'a learner cannot create a course'
);
select lives_ok(
  $$update public.workspace_user_groups
    set is_course_published = false, archived = true
    where id = 'c1940000-0000-4000-8000-000000000020'$$,
  'a learner course update runs'
);
select lives_ok(
  $$delete from public.workspace_user_groups
    where id = 'c1940000-0000-4000-8000-000000000021'$$,
  'a learner course delete runs'
);

reset role;
select is(
  (
    select role::text
    from public.workspace_user_groups_users
    where group_id = 'c1940000-0000-4000-8000-000000000020'
  ),
  'STUDENT',
  'the learner did not change or remove their enrollment'
);
select ok(
  (
    select is_course_published and not archived
    from public.workspace_user_groups
    where id = 'c1940000-0000-4000-8000-000000000020'
  )
  and exists (
    select 1 from public.workspace_user_groups
    where id = 'c1940000-0000-4000-8000-000000000021'
  ),
  'the learner did not edit or delete a course'
);

-- create_user_groups creates courses but does not manage rosters.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1940000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
select lives_ok(
  $$insert into public.workspace_user_groups (id, ws_id, name)
    values ('c1940000-0000-4000-8000-000000000022', 'c1940000-0000-4000-8000-000000000010', 'Created course')$$,
  'a create_user_groups member creates a course'
);
select throws_ok(
  $$insert into public.workspace_user_groups_users (group_id, user_id, role)
    select 'c1940000-0000-4000-8000-000000000021', learner, 'STUDENT'
    from roster_people$$,
  '42501',
  'new row violates row-level security policy for table "workspace_user_groups_users"',
  'create_user_groups alone does not manage rosters'
);

-- update_user_groups manages rosters and edits courses.
select set_config(
  'request.jwt.claims',
  '{"sub":"c1940000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',
  true
);
select lives_ok(
  $$insert into public.workspace_user_groups_users (group_id, user_id, role)
    select 'c1940000-0000-4000-8000-000000000021', learner, 'STUDENT'
    from roster_people$$,
  'an update_user_groups member enrols a learner'
);
select lives_ok(
  $$update public.workspace_user_groups
    set name = 'Renamed course'
    where id = 'c1940000-0000-4000-8000-000000000020'$$,
  'an update_user_groups member edits a course'
);

reset role;
select ok(
  exists (
    select 1
    from public.workspace_user_groups_users, roster_people
    where group_id = 'c1940000-0000-4000-8000-000000000021'
      and user_id = roster_people.learner
  )
  and (
    select name from public.workspace_user_groups
    where id = 'c1940000-0000-4000-8000-000000000020'
  ) = 'Renamed course',
  'manager changes were stored'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_user_groups_users', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.workspace_user_groups', 'TRUNCATE'),
  'authenticated cannot truncate courses or rosters'
);

select finish();
rollback;
