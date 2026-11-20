-- Quiz answer keys stay private and quiz rows are for course managers.
-- A learner who is a plain workspace member cannot read prompts or keys,
-- change scores, create quizzes or detach test questions. Matching and
-- ordering keys written into content move to private.workspace_quiz_answers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  ('c1930000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quiz-key-teacher@example.com', now(), now(), now()),
  ('c1930000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quiz-key-learner@example.com', now(), now(), now()),
  ('c1930000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'quiz-key-viewer@example.com', now(), now(), now()),
  ('c1930000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'quiz-key-editor@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1930000-0000-4000-8000-000000000001', 'Quiz Teacher'),
  ('c1930000-0000-4000-8000-000000000002', 'Quiz Learner'),
  ('c1930000-0000-4000-8000-000000000003', 'Quiz Viewer'),
  ('c1930000-0000-4000-8000-000000000004', 'Quiz Editor')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  'c1930000-0000-4000-8000-000000000010',
  'Quiz Key Workspace',
  false,
  'c1930000-0000-4000-8000-000000000001'
);

-- New workspaces default every MEMBER to admin. A school that enrols
-- learners as members turns that default off, which this fixture does.
update public.workspace_default_permissions
set enabled = false
where ws_id = 'c1930000-0000-4000-8000-000000000010'
  and permission = 'admin';

insert into public.workspace_members (ws_id, user_id, type)
values
  ('c1930000-0000-4000-8000-000000000010', 'c1930000-0000-4000-8000-000000000002', 'MEMBER'),
  ('c1930000-0000-4000-8000-000000000010', 'c1930000-0000-4000-8000-000000000003', 'MEMBER'),
  ('c1930000-0000-4000-8000-000000000010', 'c1930000-0000-4000-8000-000000000004', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name)
values
  ('c1930000-0000-4000-8000-000000000011', 'c1930000-0000-4000-8000-000000000010', 'Viewers'),
  ('c1930000-0000-4000-8000-000000000012', 'c1930000-0000-4000-8000-000000000010', 'Editors');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('c1930000-0000-4000-8000-000000000010', 'c1930000-0000-4000-8000-000000000011', 'view_user_groups', true),
  ('c1930000-0000-4000-8000-000000000010', 'c1930000-0000-4000-8000-000000000012', 'update_user_groups', true);

insert into public.workspace_role_members (role_id, user_id)
values
  ('c1930000-0000-4000-8000-000000000011', 'c1930000-0000-4000-8000-000000000003'),
  ('c1930000-0000-4000-8000-000000000012', 'c1930000-0000-4000-8000-000000000004');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values (
  'c1930000-0000-4000-8000-000000000020',
  'c1930000-0000-4000-8000-000000000010',
  'Quiz course',
  true
);

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values (
  'c1930000-0000-4000-8000-000000000030',
  'c1930000-0000-4000-8000-000000000020',
  1,
  'Modules'
);

insert into public.workspace_course_modules (
  id, group_id, module_group_id, sort_key, name, is_published
)
values (
  'c1930000-0000-4000-8000-000000000031',
  'c1930000-0000-4000-8000-000000000020',
  'c1930000-0000-4000-8000-000000000030',
  1, 'Lesson', true
);

-- Legacy writers put the key in content; the trigger must move it.
insert into public.workspace_quizzes (id, ws_id, question, type, content, score)
values
  (
    'c1930000-0000-4000-8000-000000000041',
    'c1930000-0000-4000-8000-000000000010',
    'Match the sounds', 'matching',
    '{"pairs":[{"left":"Cat","right":"Meo"},{"left":"Dog","right":"Gau"},{"left":"Cow","right":"Bo"}]}',
    3
  ),
  (
    'c1930000-0000-4000-8000-000000000042',
    'c1930000-0000-4000-8000-000000000010',
    'Order the numbers', 'ordering',
    '{"items":["one","two","three","four"]}',
    2
  ),
  (
    'c1930000-0000-4000-8000-000000000043',
    'c1930000-0000-4000-8000-000000000010',
    'Pick one', 'multiple_choice',
    '{"options":["x","y"]}',
    1
  ),
  (
    'c1930000-0000-4000-8000-000000000044',
    'c1930000-0000-4000-8000-000000000010',
    'Already a prompt', 'ordering',
    '{"items":["b","a"],"shuffled":true}',
    1
  );

insert into private.workspace_quiz_answers (quiz_id, answer)
values ('c1930000-0000-4000-8000-000000000044', '{"order":["a","b"]}');

insert into public.course_module_quizzes (module_id, quiz_id)
values ('c1930000-0000-4000-8000-000000000031', 'c1930000-0000-4000-8000-000000000043');

insert into public.course_tests (id, course_id, name, is_published)
values (
  'c1930000-0000-4000-8000-000000000050',
  'c1930000-0000-4000-8000-000000000020',
  'Quiz test',
  true
);

insert into public.course_test_modules (test_id, module_id)
values ('c1930000-0000-4000-8000-000000000050', 'c1930000-0000-4000-8000-000000000031');

insert into public.course_test_quizzes (test_id, module_id, quiz_id)
values (
  'c1930000-0000-4000-8000-000000000050',
  'c1930000-0000-4000-8000-000000000031',
  'c1930000-0000-4000-8000-000000000041'
);

-- Keys move out of content.
select ok(
  (select content::text from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000041') not like '%"right"%',
  'matching content keeps no right-hand answers'
);
select is(
  (select answer from private.workspace_quiz_answers where quiz_id = 'c1930000-0000-4000-8000-000000000041'),
  '{"pairs":[{"left":"Cat","right":"Meo"},{"left":"Dog","right":"Gau"},{"left":"Cow","right":"Bo"}]}'::jsonb,
  'matching pairs become the private key'
);
select is(
  (select content -> 'pairs' from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000041'),
  '[{"left":"Cat"},{"left":"Dog"},{"left":"Cow"}]'::jsonb,
  'the matching prompt keeps only the left side'
);
select is(
  (
    select array_agg(choice order by choice)
    from public.workspace_quizzes as quiz,
      jsonb_array_elements_text(quiz.content -> 'choices') as choice
    where quiz.id = 'c1930000-0000-4000-8000-000000000041'
  ),
  array['Bo', 'Gau', 'Meo'],
  'the matching prompt offers every right-hand choice'
);
select is(
  (select answer from private.workspace_quiz_answers where quiz_id = 'c1930000-0000-4000-8000-000000000042'),
  '{"order":["one","two","three","four"]}'::jsonb,
  'the ordering sequence becomes the private key'
);
select ok(
  (select content -> 'shuffled' = 'true'::jsonb from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000042')
  and (
    select array_agg(item order by item)
    from public.workspace_quizzes as quiz,
      jsonb_array_elements_text(quiz.content -> 'items') as item
    where quiz.id = 'c1930000-0000-4000-8000-000000000042'
  ) = array['four', 'one', 'three', 'two'],
  'the ordering prompt is marked and holds the same items'
);
select is(
  private.workspace_quiz_prompt_content(
    'c1930000-0000-4000-8000-000000000042', 'ordering', '{"order":["a","b","c","d"]}'
  ),
  private.workspace_quiz_prompt_content(
    'c1930000-0000-4000-8000-000000000042', 'ordering', '{"order":["d","b","a","c"]}'
  ),
  'the prompt order does not depend on the authored order'
);
select is(
  (select content from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000044'),
  '{"items":["b","a"],"shuffled":true}'::jsonb,
  'a stored prompt is left as written'
);
select is(
  (select answer from private.workspace_quiz_answers where quiz_id = 'c1930000-0000-4000-8000-000000000044'),
  '{"order":["a","b"]}'::jsonb,
  'a stored prompt keeps its existing key'
);

update public.workspace_quizzes
set content = '{"pairs":[{"left":"Cat","right":"Meow"}]}'
where id = 'c1930000-0000-4000-8000-000000000041';

select ok(
  (select answer from private.workspace_quiz_answers where quiz_id = 'c1930000-0000-4000-8000-000000000041')
    = '{"pairs":[{"left":"Cat","right":"Meow"}]}'::jsonb
  and (select content::text from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000041') not like '%"right"%',
  'a legacy update moves the new key and strips content again'
);

-- A learner is a plain member: no quiz rows, no keys, no writes.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1930000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);

select is(
  (select count(*)::integer from public.workspace_quizzes where ws_id = 'c1930000-0000-4000-8000-000000000010'),
  0,
  'a learner cannot read quiz rows or their content'
);
select throws_ok(
  $$select answer from private.workspace_quiz_answers$$,
  '42501',
  null,
  'a learner cannot read private answer keys'
);
select lives_ok(
  $$update public.workspace_quizzes set score = 100 where id = 'c1930000-0000-4000-8000-000000000043'$$,
  'a learner score update runs'
);
select throws_ok(
  $$insert into public.workspace_quizzes (ws_id, question, score)
    values ('c1930000-0000-4000-8000-000000000010', 'Planted', 1)$$,
  '42501',
  null,
  'a learner cannot create a quiz'
);
select lives_ok(
  $$delete from public.course_test_quizzes where quiz_id = 'c1930000-0000-4000-8000-000000000041'$$,
  'a learner test question delete runs'
);
select throws_ok(
  $$insert into public.course_module_quizzes (module_id, quiz_id)
    values ('c1930000-0000-4000-8000-000000000031', 'c1930000-0000-4000-8000-000000000042')$$,
  '42501',
  null,
  'a learner cannot link a quiz into a module'
);

-- A view_user_groups member reads but cannot write.
select set_config(
  'request.jwt.claims',
  '{"sub":"c1930000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
select is(
  (select count(*)::integer from public.workspace_quizzes where ws_id = 'c1930000-0000-4000-8000-000000000010'),
  4,
  'a view_user_groups member reads quiz rows'
);
select lives_ok(
  $$update public.workspace_quizzes set score = 50 where id = 'c1930000-0000-4000-8000-000000000043'$$,
  'a viewer score update runs'
);

reset role;
select is(
  (select score::real from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000043'),
  1::real,
  'neither the learner nor the viewer changed the score'
);
select ok(
  exists (
    select 1 from public.course_test_quizzes
    where quiz_id = 'c1930000-0000-4000-8000-000000000041'
  ),
  'the learner did not remove the test question'
);

-- Course managers keep authoring.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1930000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',
  true
);
select lives_ok(
  $$update public.workspace_quizzes set score = 5 where id = 'c1930000-0000-4000-8000-000000000043'$$,
  'an update_user_groups member updates a score'
);
select lives_ok(
  $$insert into public.workspace_quizzes (id, ws_id, question, score)
    values ('c1930000-0000-4000-8000-000000000045', 'c1930000-0000-4000-8000-000000000010', 'Editor quiz', 1)$$,
  'an update_user_groups member creates a quiz'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c1930000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);
select is(
  (select count(*)::integer from public.workspace_quizzes where ws_id = 'c1930000-0000-4000-8000-000000000010'),
  5,
  'the workspace creator reads every quiz'
);

reset role;
select is(
  (select score::real from public.workspace_quizzes where id = 'c1930000-0000-4000-8000-000000000043'),
  5::real,
  'the manager score change was stored'
);

select ok(
  not has_table_privilege('anon', 'public.workspace_quizzes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.workspace_quizzes', 'TRUNCATE'),
  'anon has no quiz grants and authenticated cannot truncate'
);
select ok(
  not has_function_privilege('authenticated', 'private.move_workspace_quiz_content_key()', 'execute')
  and not has_function_privilege('service_role', 'private.move_workspace_quiz_content_key()', 'execute'),
  'the key trigger function is not callable by API roles'
);

select finish();
rollback;
