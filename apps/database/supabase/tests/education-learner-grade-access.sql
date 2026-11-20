-- Learners cannot read their own test scores, test answer correctness or
-- practice submission grades directly, and cannot write a practice grade.
-- The Learn server reads these rows with service_role and withholds scores
-- until the teacher releases them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  ('c1950000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'grade-owner@example.com', now(), now(), now()),
  ('c1950000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'grade-learner@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1950000-0000-4000-8000-000000000001', 'Grade Owner'),
  ('c1950000-0000-4000-8000-000000000002', 'Grade Learner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  'c1950000-0000-4000-8000-000000000010',
  'Grade Workspace',
  false,
  'c1950000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (ws_id, user_id, type)
values ('c1950000-0000-4000-8000-000000000010', 'c1950000-0000-4000-8000-000000000002', 'MEMBER');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values ('c1950000-0000-4000-8000-000000000020', 'c1950000-0000-4000-8000-000000000010', 'Graded course', true);

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values ('c1950000-0000-4000-8000-000000000030', 'c1950000-0000-4000-8000-000000000020', 1, 'Modules');

insert into public.workspace_course_modules (id, group_id, module_group_id, sort_key, name, is_published)
values (
  'c1950000-0000-4000-8000-000000000031',
  'c1950000-0000-4000-8000-000000000020',
  'c1950000-0000-4000-8000-000000000030',
  1, 'Lesson', true
);

insert into public.workspace_quizzes (id, ws_id, question, score)
values ('c1950000-0000-4000-8000-000000000041', 'c1950000-0000-4000-8000-000000000010', 'Graded question', 1);

insert into public.course_tests (id, course_id, name, is_published, is_score_published)
values (
  'c1950000-0000-4000-8000-000000000050',
  'c1950000-0000-4000-8000-000000000020',
  'Unreleased test',
  true,
  false
);

insert into public.course_test_attempts (id, test_id, user_id, submitted_at, score)
values (
  'c1950000-0000-4000-8000-000000000060',
  'c1950000-0000-4000-8000-000000000050',
  'c1950000-0000-4000-8000-000000000002',
  now(),
  9
);

insert into public.course_test_attempt_answers (attempt_id, quiz_id, answer, is_correct, score_awarded)
values (
  'c1950000-0000-4000-8000-000000000060',
  'c1950000-0000-4000-8000-000000000041',
  '{"text":"answer"}',
  true,
  1
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'course_test_attempts',
        'course_test_attempt_answers',
        'course_module_quiz_submissions'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'client roles have no grants on graded learner rows'
);
select ok(
  has_table_privilege('service_role', 'public.course_test_attempts', 'SELECT')
  and has_table_privilege('service_role', 'public.course_test_attempts', 'UPDATE')
  and has_table_privilege('service_role', 'public.course_test_attempt_answers', 'INSERT')
  and has_table_privilege('service_role', 'public.course_module_quiz_submissions', 'INSERT')
  and has_table_privilege('service_role', 'public.course_module_quiz_submissions', 'SELECT'),
  'service_role keeps grading access'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'course_test_attempts',
        'course_test_attempt_answers',
        'course_module_quiz_submissions'
      )
      and permissive = 'PERMISSIVE'
      and 'authenticated' = any (roles)
  ),
  'no permissive client policy remains on graded learner rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1950000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);

select throws_ok(
  $$select score from public.course_test_attempts$$,
  '42501',
  null,
  'a learner cannot read an unreleased test score'
);
select throws_ok(
  $$select is_correct, score_awarded from public.course_test_attempt_answers$$,
  '42501',
  null,
  'a learner cannot read test answer correctness'
);
select throws_ok(
  $$select is_correct from public.course_module_quiz_submissions$$,
  '42501',
  null,
  'a learner cannot read practice grades'
);
select throws_ok(
  $$insert into public.course_module_quiz_submissions (module_id, quiz_id, user_id, is_correct)
    values (
      'c1950000-0000-4000-8000-000000000031',
      'c1950000-0000-4000-8000-000000000041',
      'c1950000-0000-4000-8000-000000000002',
      true
    )$$,
  '42501',
  null,
  'a learner cannot write a practice grade'
);
select throws_ok(
  $$update public.course_test_attempts set score = 100$$,
  '42501',
  null,
  'a learner cannot change a test score'
);

reset role;
set local role anon;
select throws_ok(
  $$select score from public.course_test_attempts$$,
  '42501',
  null,
  'anon cannot read test scores'
);
reset role;

select is(
  (select score::real from public.course_test_attempts where id = 'c1950000-0000-4000-8000-000000000060'),
  9::real,
  'the stored score is unchanged'
);

select finish();
rollback;
