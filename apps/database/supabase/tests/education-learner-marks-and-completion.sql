begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('c1970000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'marks-owner@example.com', now(), now(), now()),
  ('c1970000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'marks-learner@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1970000-0000-4000-8000-000000000001', 'Marks Owner'),
  ('c1970000-0000-4000-8000-000000000002', 'Marks Learner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('c1970000-0000-4000-8000-000000000010', 'Marks Workspace', false, 'c1970000-0000-4000-8000-000000000001');

update public.workspace_default_permissions
set enabled = false
where ws_id = 'c1970000-0000-4000-8000-000000000010' and permission = 'admin';

insert into public.workspace_members (ws_id, user_id, type)
values ('c1970000-0000-4000-8000-000000000010', 'c1970000-0000-4000-8000-000000000002', 'MEMBER');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values ('c1970000-0000-4000-8000-000000000020', 'c1970000-0000-4000-8000-000000000010', 'Marks Course', true);

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values ('c1970000-0000-4000-8000-000000000030', 'c1970000-0000-4000-8000-000000000020', 1, 'Modules');

insert into public.workspace_course_modules (
  id, group_id, module_group_id, sort_key, name, is_published, is_quiz_score_published
)
values (
  'c1970000-0000-4000-8000-000000000031', 'c1970000-0000-4000-8000-000000000020',
  'c1970000-0000-4000-8000-000000000030', 1, 'Lesson', true, false
);

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
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.workspace_flashcards', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.course_module_flashcards', 'TRUNCATE'),
  'flashcard table privileges cannot bypass row policies using truncate'
);

select * from finish();
rollback;
