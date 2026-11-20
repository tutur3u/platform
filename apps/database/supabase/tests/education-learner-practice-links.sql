-- Practice quizzes have one definition, shared by the web practice GET and
-- the submit RPC: published modules (first 20), multiple-choice quizzes in
-- the workspace with at least two options, quiz sets in the workspace, and
-- at most 20 distinct quizzes. Submit locks the learner link, course and
-- enrollment rows before grading and rejects a learner who lost access.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  ('c1960000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'practice-owner@example.com', now(), now(), now()),
  ('c1960000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'practice-learner@example.com', now(), now(), now());

insert into public.users (id, display_name)
values
  ('c1960000-0000-4000-8000-000000000001', 'Practice Owner'),
  ('c1960000-0000-4000-8000-000000000002', 'Practice Learner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  ('c1960000-0000-4000-8000-000000000010', 'Practice Workspace', false, 'c1960000-0000-4000-8000-000000000001'),
  ('c1960000-0000-4000-8000-000000000011', 'Foreign Workspace', false, 'c1960000-0000-4000-8000-000000000001');

insert into public.workspace_members (ws_id, user_id, type)
values ('c1960000-0000-4000-8000-000000000010', 'c1960000-0000-4000-8000-000000000002', 'MEMBER');

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values ('c1960000-0000-4000-8000-000000000020', 'c1960000-0000-4000-8000-000000000010', 'Practice course', true);

insert into public.workspace_user_groups_users (group_id, user_id, role)
select 'c1960000-0000-4000-8000-000000000020', link.virtual_user_id, 'STUDENT'
from public.workspace_user_linked_users as link
where link.platform_user_id = 'c1960000-0000-4000-8000-000000000002'
  and link.ws_id = 'c1960000-0000-4000-8000-000000000010';

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values ('c1960000-0000-4000-8000-000000000030', 'c1960000-0000-4000-8000-000000000020', 1, 'Modules');

insert into public.workspace_course_modules (id, group_id, module_group_id, sort_key, name, is_published)
values
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000020', 'c1960000-0000-4000-8000-000000000030', 1, 'Published', true),
  ('c1960000-0000-4000-8000-000000000032', 'c1960000-0000-4000-8000-000000000020', 'c1960000-0000-4000-8000-000000000030', 2, 'Draft', false),
  ('c1960000-0000-4000-8000-000000000033', 'c1960000-0000-4000-8000-000000000020', 'c1960000-0000-4000-8000-000000000030', 3, 'Bulk', true);

-- 41 eligible; 42 in a draft module; 43 one option; 44 matching;
-- 45 in a foreign quiz set; 46 in a set on the draft module; 47 eligible set.
insert into public.workspace_quizzes (id, ws_id, question, type, created_at)
values
  ('c1960000-0000-4000-8000-000000000041', 'c1960000-0000-4000-8000-000000000010', 'Eligible', 'multiple_choice', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000042', 'c1960000-0000-4000-8000-000000000010', 'Draft module', 'multiple_choice', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000043', 'c1960000-0000-4000-8000-000000000010', 'One option', 'multiple_choice', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000044', 'c1960000-0000-4000-8000-000000000010', 'Matching', 'matching', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000045', 'c1960000-0000-4000-8000-000000000010', 'Foreign set', 'multiple_choice', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000046', 'c1960000-0000-4000-8000-000000000010', 'Draft set', 'multiple_choice', now() - interval '9 days'),
  ('c1960000-0000-4000-8000-000000000047', 'c1960000-0000-4000-8000-000000000010', 'Set quiz', 'multiple_choice', now() - interval '9 days');

insert into public.workspace_quizzes (id, ws_id, question, type, created_at)
select
  ('c1960000-0000-4000-8001-' || lpad(g::text, 12, '0'))::uuid,
  'c1960000-0000-4000-8000-000000000010',
  'Bulk ' || g,
  'multiple_choice',
  now() - interval '1 day' + g * interval '1 minute'
from generate_series(1, 25) as g;

insert into public.quiz_options (id, quiz_id, value, is_correct)
select
  ('c1960000-0000-4000-8002-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  quiz.id,
  option.value,
  option.is_correct
from public.workspace_quizzes as quiz
cross join (values ('right', true), ('wrong', false)) as option(value, is_correct)
where quiz.ws_id = 'c1960000-0000-4000-8000-000000000010'
  and not (quiz.id = 'c1960000-0000-4000-8000-000000000043' and not option.is_correct);

insert into public.workspace_quiz_sets (id, ws_id, name)
values
  ('c1960000-0000-4000-8000-000000000060', 'c1960000-0000-4000-8000-000000000011', 'Foreign set'),
  ('c1960000-0000-4000-8000-000000000061', 'c1960000-0000-4000-8000-000000000010', 'Draft set'),
  ('c1960000-0000-4000-8000-000000000062', 'c1960000-0000-4000-8000-000000000010', 'Published set');

insert into public.quiz_set_quizzes (set_id, quiz_id)
values
  ('c1960000-0000-4000-8000-000000000060', 'c1960000-0000-4000-8000-000000000045'),
  ('c1960000-0000-4000-8000-000000000061', 'c1960000-0000-4000-8000-000000000046'),
  ('c1960000-0000-4000-8000-000000000062', 'c1960000-0000-4000-8000-000000000047');

insert into public.course_module_quiz_sets (module_id, set_id)
values
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000060'),
  ('c1960000-0000-4000-8000-000000000032', 'c1960000-0000-4000-8000-000000000061'),
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000062');

insert into public.course_module_quizzes (module_id, quiz_id)
values
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000041'),
  ('c1960000-0000-4000-8000-000000000032', 'c1960000-0000-4000-8000-000000000042'),
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000043'),
  ('c1960000-0000-4000-8000-000000000031', 'c1960000-0000-4000-8000-000000000044');

insert into public.course_module_quizzes (module_id, quiz_id)
select 'c1960000-0000-4000-8000-000000000033', ('c1960000-0000-4000-8001-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 25) as g;

create temp table practice on commit drop as
select *
from private.education_learner_practice_quizzes(
  'c1960000-0000-4000-8000-000000000010',
  'c1960000-0000-4000-8000-000000000020'
);
grant select on practice to service_role;

create function pg_temp.practice_submit(p_key text, p_quiz uuid)
returns jsonb
language sql
as $$
  select private.submit_education_learner_attempt(
    'c1960000-0000-4000-8000-000000000010',
    'c1960000-0000-4000-8000-000000000002',
    'c1960000-0000-4000-8000-000000000020',
    p_key,
    null,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'quiz_id', p_quiz,
      'selected_option_id', (
        select option.id from public.quiz_options as option
        where option.quiz_id = p_quiz
        order by option.is_correct desc
        limit 1
      )
    ))
  );
$$;

select ok(
  has_function_privilege('service_role', 'private.education_learner_practice_quizzes(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.education_learner_practice_quizzes(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'private.education_learner_practice_quizzes(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.education_learner_course_quiz_links(uuid,uuid)', 'execute'),
  'only service_role reads the practice list; the link helper stays internal'
);
select is(
  (select count(distinct quiz_id)::integer from practice),
  20,
  'practice serves at most 20 distinct quizzes'
);
select is(
  (select array_agg(quiz_position order by quiz_position) from (select distinct quiz_id, quiz_position from practice) as served),
  (select array_agg(g) from generate_series(1, 20) as g),
  'positions are contiguous from 1'
);
select is(
  (select array_agg(quiz_id order by quiz_position) from (select distinct quiz_id, quiz_position from practice where quiz_position <= 2) as head),
  array['c1960000-0000-4000-8000-000000000041', 'c1960000-0000-4000-8000-000000000047']::uuid[],
  'the first published module comes first, direct links before sets'
);
select ok(
  not exists (
    select 1 from practice
    where quiz_id in (
      'c1960000-0000-4000-8000-000000000042',
      'c1960000-0000-4000-8000-000000000046'
    )
  ),
  'draft modules are excluded on both the direct and the set branch'
);
select ok(
  not exists (select 1 from practice where quiz_id = 'c1960000-0000-4000-8000-000000000043'),
  'a quiz with fewer than two options is excluded'
);
select ok(
  not exists (select 1 from practice where quiz_id = 'c1960000-0000-4000-8000-000000000044'),
  'a quiz that is not multiple choice is excluded'
);
select ok(
  not exists (select 1 from practice where quiz_id = 'c1960000-0000-4000-8000-000000000045'),
  'a quiz set from another workspace is excluded'
);

set local role service_role;
select throws_ok(
  $$select pg_temp.practice_submit('draft', 'c1960000-0000-4000-8000-000000000042')$$,
  '23514', null, 'submit rejects a quiz in a draft module'
);
select throws_ok(
  $$select pg_temp.practice_submit('draft-set', 'c1960000-0000-4000-8000-000000000046')$$,
  '23514', null, 'submit rejects a quiz set on a draft module'
);
select throws_ok(
  $$select pg_temp.practice_submit('foreign-set', 'c1960000-0000-4000-8000-000000000045')$$,
  '23514', null, 'submit rejects a quiz from a foreign quiz set'
);
select throws_ok(
  $$select pg_temp.practice_submit('matching', 'c1960000-0000-4000-8000-000000000044')$$,
  '23514', null, 'submit rejects a quiz type practice does not serve'
);
select throws_ok(
  $$select pg_temp.practice_submit('over-cap', (
    select quiz.id from public.workspace_quizzes as quiz
    where quiz.ws_id = 'c1960000-0000-4000-8000-000000000010'
      and quiz.question like 'Bulk %'
      and not exists (select 1 from practice where practice.quiz_id = quiz.id)
    limit 1
  ))$$,
  '23514', null, 'submit rejects a quiz beyond the practice cap'
);
select is(
  (pg_temp.practice_submit('served', 'c1960000-0000-4000-8000-000000000041') -> 'attempt' ->> 'correct_count')::integer,
  1,
  'submit grades a served quiz'
);
select ok(
  (pg_temp.practice_submit('served-set', 'c1960000-0000-4000-8000-000000000047') -> 'completed_module_ids')
    = '[]'::jsonb,
  'a module completes only when every served quiz in it is correct'
);
reset role;

-- F3: rows are locked FOR SHARE in a fixed order before grading.
select ok(
  (
    with body as (
      select lower(pg_get_functiondef(
        'private.submit_education_learner_attempt(uuid,uuid,uuid,text,integer,jsonb)'::regprocedure
      )) as src
    )
    select position('from public.workspace_user_linked_users' in src) > 0
      and position('from public.workspace_user_linked_users' in src)
        < position('from public.workspace_user_groups as course' in src)
      and position('from public.workspace_user_groups as course' in src)
        < position('from public.workspace_user_groups_users as enrollment' in src)
      and (length(src) - length(replace(src, 'for share', ''))) / length('for share') = 3
    from body
  ),
  'submit locks the link, course and enrollment rows in order'
);

update public.workspace_user_groups
set archived = true
where id = 'c1960000-0000-4000-8000-000000000020';
set local role service_role;
select throws_ok(
  $$select pg_temp.practice_submit('archived', 'c1960000-0000-4000-8000-000000000041')$$,
  '42501', null, 'an archived course rejects the attempt'
);
reset role;

update public.workspace_user_groups
set archived = false
where id = 'c1960000-0000-4000-8000-000000000020';
delete from public.workspace_user_groups_users
where group_id = 'c1960000-0000-4000-8000-000000000020';
set local role service_role;
select throws_ok(
  $$select pg_temp.practice_submit('removed', 'c1960000-0000-4000-8000-000000000041')$$,
  '42501', null, 'a learner removed from the roster is rejected'
);
reset role;

select is(
  (
    select count(*)::integer
    from private.education_learner_quiz_attempts
    where user_id = 'c1960000-0000-4000-8000-000000000002'
  ),
  2,
  'only the two served attempts were stored'
);

select finish();
rollback;
