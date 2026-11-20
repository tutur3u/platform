begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('c1970000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'marks-owner@example.com', now(), now(), now()),
  ('c1970000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'marks-learner@example.com', now(), now(), now()),
  ('c1970000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'marks-classmate@example.com', now(), now(), now()),
  ('c1970000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'marks-teacher@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1970000-0000-4000-8000-000000000001', 'Marks Owner'),
  ('c1970000-0000-4000-8000-000000000002', 'Marks Learner'),
  ('c1970000-0000-4000-8000-000000000003', 'Marks Classmate'),
  ('c1970000-0000-4000-8000-000000000004', 'Marks Teacher')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  ('c1970000-0000-4000-8000-000000000010', 'Marks Workspace', false, 'c1970000-0000-4000-8000-000000000001'),
  ('c1970000-0000-4000-8000-000000000011', 'Other Workspace', false, 'c1970000-0000-4000-8000-000000000001');

update public.workspace_default_permissions
set enabled = false
where ws_id in ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000011')
  and permission in ('admin', 'update_user_groups', 'view_user_groups_scores');

insert into public.workspace_members (ws_id, user_id, type)
values
  ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000002', 'MEMBER'),
  ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000003', 'MEMBER'),
  ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000004', 'MEMBER'),
  ('c1970000-0000-4000-8000-000000000011', 'c1970000-0000-4000-8000-000000000004', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name)
values
  ('c1970000-0000-4000-8000-000000000012', 'c1970000-0000-4000-8000-000000000010', 'Teachers'),
  ('c1970000-0000-4000-8000-000000000013', 'c1970000-0000-4000-8000-000000000011', 'Teachers');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000012', 'update_user_groups', true),
  ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000012', 'view_user_groups_scores', true),
  ('c1970000-0000-4000-8000-000000000011', 'c1970000-0000-4000-8000-000000000013', 'update_user_groups', true);

insert into public.workspace_role_members (role_id, user_id)
values
  ('c1970000-0000-4000-8000-000000000012', 'c1970000-0000-4000-8000-000000000004'),
  ('c1970000-0000-4000-8000-000000000013', 'c1970000-0000-4000-8000-000000000004');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values
  ('c1970000-0000-4000-8000-000000000020', 'c1970000-0000-4000-8000-000000000010', 'Marks Course', true),
  ('c1970000-0000-4000-8000-000000000021', 'c1970000-0000-4000-8000-000000000011', 'Other Course', true);

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values
  ('c1970000-0000-4000-8000-000000000030', 'c1970000-0000-4000-8000-000000000020', 1, 'Modules'),
  ('c1970000-0000-4000-8000-000000000032', 'c1970000-0000-4000-8000-000000000021', 1, 'Other Modules');

insert into public.workspace_course_modules (
  id, group_id, module_group_id, sort_key, name, is_published, is_quiz_score_published
)
values (
  'c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000020',
  'c1970000-0000-4000-8000-000000000030', 1, 'Lesson', true, false
), (
  'c1970000-0000-4000-8000-000000000033', 'c1970000-0000-4000-8000-000000000021',
  'c1970000-0000-4000-8000-000000000032', 1, 'Other Lesson', true, false
);

insert into public.workspace_flashcards (id, ws_id, front, back)
values
  ('c1970000-0000-4000-8000-000000000051', 'c1970000-0000-4000-8000-000000000010', 'Question', 'Answer'),
  ('c1970000-0000-4000-8000-000000000052', 'c1970000-0000-4000-8000-000000000010', 'Question 2', 'Answer 2');

insert into public.course_module_flashcards (module_id, flashcard_id)
values ('c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000051');

insert into public.course_module_completion_status (module_id, user_id, completion_status, completed_at)
values ('c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000002', true, now());

insert into public.user_group_metrics (id, ws_id, group_id, name, unit)
values
  ('c1970000-0000-4000-8000-000000000041', 'c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000020', 'Quiz', 'points'),
  ('c1970000-0000-4000-8000-000000000042', 'c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000020', 'Report', 'points');

create temp table learner on commit drop as
select virtual_user_id as id
from public.workspace_user_linked_users
where platform_user_id = 'c1970000-0000-4000-8000-000000000002'
  and ws_id = 'c1970000-0000-4000-8000-000000000010';
grant select on learner to authenticated, service_role;

insert into public.workspace_user_groups_users (group_id, user_id, role)
select 'c1970000-0000-4000-8000-000000000020', id, 'STUDENT' from learner;

-- A second learner in the same course has a separate mark.
insert into public.workspace_user_groups_users (group_id, user_id, role)
select 'c1970000-0000-4000-8000-000000000020', virtual_user_id, 'STUDENT'
from public.workspace_user_linked_users
where ws_id = 'c1970000-0000-4000-8000-000000000010'
  and platform_user_id = 'c1970000-0000-4000-8000-000000000003';

insert into public.user_indicators (user_id, indicator_id, value)
select virtual_user_id, 'c1970000-0000-4000-8000-000000000041', 9
from public.workspace_user_linked_users
where ws_id = 'c1970000-0000-4000-8000-000000000010'
  and platform_user_id = 'c1970000-0000-4000-8000-000000000003';

set local role service_role;
select lives_ok(
  $$insert into public.user_indicators (user_id, indicator_id, value)
    select id, 'c1970000-0000-4000-8000-000000000041', 6 from learner
    on conflict (user_id, indicator_id) do update set value = excluded.value$$,
  'the Teach service-role grading path can insert marks'
);
select lives_ok(
  $$insert into public.user_indicators (user_id, indicator_id, value)
    select id, 'c1970000-0000-4000-8000-000000000041', 7 from learner
    on conflict (user_id, indicator_id) do update set value = excluded.value$$,
  'the Teach service-role grading path can revise marks'
);
select is(
  (select value from public.user_indicators where user_id = (select id from learner)),
  7::numeric,
  'the revised mark is visible to the Learn service role'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1970000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);
select ok(
  public.is_org_member(auth.uid(), 'c1970000-0000-4000-8000-000000000010'),
  'the learner is a member of the course workspace'
);
select results_eq(
  $$select value from public.user_indicators
    where indicator_id = 'c1970000-0000-4000-8000-000000000041'$$,
  $$values (7::numeric)$$,
  'learner can read their own mark, with other course members excluded'
);
select throws_ok(
  $$insert into public.user_indicators (user_id, indicator_id, value)
    select id, 'c1970000-0000-4000-8000-000000000042', 10 from learner$$,
  '42501', null, 'a learner cannot insert a mark for themselves'
);
select throws_ok(
  $$update public.user_indicators set value = 10 where user_id = (select id from learner)$$,
  '42501', null, 'a learner cannot raise their own mark'
);
select throws_ok(
  $$delete from public.user_indicators where user_id = (select id from learner)$$,
  '42501', null, 'a learner cannot erase their own mark'
);
select throws_ok(
  $$select completion_status, completed_at from public.course_module_completion_status
    where user_id = (select auth.uid())$$,
  '42501', null, 'legacy completion rows cannot expose unreleased results'
);
select is(
  (select front from public.workspace_flashcards where id = 'c1970000-0000-4000-8000-000000000051'),
  'Question', 'learners can read flashcards in their workspace'
);
select throws_ok(
  $$insert into public.workspace_flashcards (ws_id, front, back)
    values ('c1970000-0000-4000-8000-000000000010', 'New', 'Card')$$,
  '42501', null, 'learners cannot create flashcards'
);
select is_empty(
  $$with changed as (
    update public.workspace_flashcards set front = 'Changed'
    where id = 'c1970000-0000-4000-8000-000000000051' returning id
  ) select id from changed$$,
  'learners cannot edit flashcards'
);
select is_empty(
  $$with changed as (
    delete from public.workspace_flashcards
    where id = 'c1970000-0000-4000-8000-000000000052' returning id
  ) select id from changed$$,
  'learners cannot delete flashcards'
);
select throws_ok(
  $$insert into public.course_module_flashcards (module_id, flashcard_id)
    values ('c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000052')$$,
  '42501', null, 'learners cannot attach a flashcard'
);
select is_empty(
  $$with changed as (
    update public.course_module_flashcards set flashcard_id = 'c1970000-0000-4000-8000-000000000052'
    where flashcard_id = 'c1970000-0000-4000-8000-000000000051' returning module_id
  ) select module_id from changed$$,
  'learners cannot replace a linked flashcard'
);
select is_empty(
  $$with changed as (
    delete from public.course_module_flashcards
    where flashcard_id = 'c1970000-0000-4000-8000-000000000051' returning module_id
  ) select module_id from changed$$,
  'learners cannot unlink a flashcard'
);
select is_empty(
  $$with changed as (
    update public.workspace_course_modules set is_quiz_score_published = true
    where id = 'c1970000-0000-4000-8000-000000000031' returning id
  ) select id from changed$$,
  'the learner cannot publish lesson quiz grades'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"c1970000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',
  true
);
select results_eq(
  $$select value from public.user_indicators
    where indicator_id = 'c1970000-0000-4000-8000-000000000041' order by value$$,
  $$values (7::numeric), (9::numeric)$$,
  'a teacher with the workspace score read permission can see both marks'
);
select lives_ok(
  $$insert into public.workspace_flashcards (id, ws_id, front, back)
    values ('c1970000-0000-4000-8000-000000000053', 'c1970000-0000-4000-8000-000000000010', 'New', 'Card')$$,
  'course managers can create flashcards'
);
select results_eq(
  $$with changed as (
    update public.workspace_flashcards set front = 'Edited'
    where id = 'c1970000-0000-4000-8000-000000000053' returning front
  ) select front from changed$$,
  $$values ('Edited'::text)$$, 'course managers can edit flashcards'
);
select lives_ok(
  $$insert into public.course_module_flashcards (module_id, flashcard_id)
    values ('c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000053')$$,
  'course managers can attach a flashcard to a module in the same workspace'
);
select throws_ok(
  $$insert into public.course_module_flashcards (module_id, flashcard_id)
    values ('c1970000-0000-4000-8000-000000000033', 'c1970000-0000-4000-8000-000000000053')$$,
  '42501', null, 'a manager of both workspaces cannot link them'
);
select throws_ok(
  $$update public.course_module_flashcards set module_id = 'c1970000-0000-4000-8000-000000000033'
    where flashcard_id = 'c1970000-0000-4000-8000-000000000053'$$,
  '42501', null, 'a manager of both workspaces cannot move the link across them'
);
select results_eq(
  $$with changed as (
    delete from public.course_module_flashcards
    where flashcard_id = 'c1970000-0000-4000-8000-000000000053' returning flashcard_id
  ) select flashcard_id from changed$$,
  $$values ('c1970000-0000-4000-8000-000000000053'::uuid)$$,
  'course managers can unlink workspace flashcards'
);
select results_eq(
  $$with changed as (
    delete from public.workspace_flashcards
    where id = 'c1970000-0000-4000-8000-000000000053' returning id
  ) select id from changed$$,
  $$values ('c1970000-0000-4000-8000-000000000053'::uuid)$$,
  'course managers can delete flashcards'
);
update public.workspace_course_modules
set is_quiz_score_published = true
where id = 'c1970000-0000-4000-8000-000000000031';
select is(
  (select is_quiz_score_published from public.workspace_course_modules
    where id = 'c1970000-0000-4000-8000-000000000031'),
  true, 'the teacher can explicitly release lesson quiz grades'
);
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.workspace_flashcards', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.course_module_flashcards', 'TRUNCATE'),
  'flashcard table privileges cannot bypass row policies using truncate'
);

select * from finish();
rollback;
