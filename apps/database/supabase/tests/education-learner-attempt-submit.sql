-- Learner submit is one service-role transaction: enrollment, both quiz
-- link types, server-side grading, idempotency, and a 10-per-minute limit.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  (
    'c1900000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'learner-submit-actor@example.com',
    now(), now(), now()
  ),
  (
    'c1900000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'learner-submit-other@example.com',
    now(), now(), now()
  );

insert into public.users (id, display_name)
values
  ('c1900000-0000-4000-8000-000000000001', 'Learner Actor'),
  ('c1900000-0000-4000-8000-000000000002', 'Learner Other')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  'c1900000-0000-4000-8000-000000000010',
  'Learner Submit Workspace',
  false,
  'c1900000-0000-4000-8000-000000000001'
);

insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
values
  (
    'c1900000-0000-4000-8000-000000000020',
    'c1900000-0000-4000-8000-000000000010',
    'Enrolled course',
    true
  ),
  (
    'c1900000-0000-4000-8000-000000000021',
    'c1900000-0000-4000-8000-000000000010',
    'Other course',
    true
  );

insert into public.workspace_user_groups_users (group_id, user_id, role)
select
  'c1900000-0000-4000-8000-000000000020',
  link.virtual_user_id,
  'STUDENT'
from public.workspace_user_linked_users as link
where link.platform_user_id = 'c1900000-0000-4000-8000-000000000001'
  and link.ws_id = 'c1900000-0000-4000-8000-000000000010';

insert into public.workspace_course_module_groups (id, group_id, sort_key, title)
values (
  'c1900000-0000-4000-8000-000000000030',
  'c1900000-0000-4000-8000-000000000020',
  1,
  'Modules'
);

insert into public.workspace_course_modules (
  id, group_id, module_group_id, sort_key, name, is_published
)
values
  (
    'c1900000-0000-4000-8000-000000000031',
    'c1900000-0000-4000-8000-000000000020',
    'c1900000-0000-4000-8000-000000000030',
    1, 'Direct', true
  ),
  (
    'c1900000-0000-4000-8000-000000000032',
    'c1900000-0000-4000-8000-000000000020',
    'c1900000-0000-4000-8000-000000000030',
    2, 'Set', true
  ),
  (
    'c1900000-0000-4000-8000-000000000033',
    'c1900000-0000-4000-8000-000000000020',
    'c1900000-0000-4000-8000-000000000030',
    3, 'Mixed', true
  );

insert into public.workspace_quizzes (id, ws_id, question, score)
values
  ('c1900000-0000-4000-8000-000000000041', 'c1900000-0000-4000-8000-000000000010', 'Direct', 9),
  ('c1900000-0000-4000-8000-000000000042', 'c1900000-0000-4000-8000-000000000010', 'Set', 4),
  ('c1900000-0000-4000-8000-000000000043', 'c1900000-0000-4000-8000-000000000010', 'Shared', 1),
  ('c1900000-0000-4000-8000-000000000044', 'c1900000-0000-4000-8000-000000000010', 'Mixed extra', 8),
  ('c1900000-0000-4000-8000-000000000045', 'c1900000-0000-4000-8000-000000000010', 'Unlinked', 1);

insert into public.quiz_options (id, quiz_id, value, is_correct, points)
values
  ('c1900000-0000-4000-8000-000000000051', 'c1900000-0000-4000-8000-000000000041', 'A', true, 2),
  ('c1900000-0000-4000-8000-000000000052', 'c1900000-0000-4000-8000-000000000042', 'B', true, null),
  ('c1900000-0000-4000-8000-000000000053', 'c1900000-0000-4000-8000-000000000043', 'C', true, 1),
  ('c1900000-0000-4000-8000-000000000054', 'c1900000-0000-4000-8000-000000000044', 'D wrong', false, 5),
  ('c1900000-0000-4000-8000-000000000055', 'c1900000-0000-4000-8000-000000000044', 'D right', true, 3),
  ('c1900000-0000-4000-8000-000000000056', 'c1900000-0000-4000-8000-000000000045', 'E', true, 1),
  -- Practice serves only quizzes with at least two options.
  ('c1900000-0000-4000-8000-000000000057', 'c1900000-0000-4000-8000-000000000041', 'A wrong', false, null),
  ('c1900000-0000-4000-8000-000000000058', 'c1900000-0000-4000-8000-000000000042', 'B wrong', false, null),
  ('c1900000-0000-4000-8000-000000000059', 'c1900000-0000-4000-8000-000000000043', 'C wrong', false, null),
  ('c1900000-0000-4000-8000-00000000005a', 'c1900000-0000-4000-8000-000000000045', 'E wrong', false, null);

insert into public.workspace_quiz_sets (id, ws_id, name)
values (
  'c1900000-0000-4000-8000-000000000060',
  'c1900000-0000-4000-8000-000000000010',
  'Practice set'
);

insert into public.quiz_set_quizzes (set_id, quiz_id)
values
  ('c1900000-0000-4000-8000-000000000060', 'c1900000-0000-4000-8000-000000000042'),
  ('c1900000-0000-4000-8000-000000000060', 'c1900000-0000-4000-8000-000000000043');

insert into public.course_module_quiz_sets (module_id, set_id)
values
  ('c1900000-0000-4000-8000-000000000032', 'c1900000-0000-4000-8000-000000000060'),
  ('c1900000-0000-4000-8000-000000000033', 'c1900000-0000-4000-8000-000000000060');

insert into public.course_module_quizzes (module_id, quiz_id)
values
  ('c1900000-0000-4000-8000-000000000031', 'c1900000-0000-4000-8000-000000000041'),
  ('c1900000-0000-4000-8000-000000000033', 'c1900000-0000-4000-8000-000000000043'),
  ('c1900000-0000-4000-8000-000000000033', 'c1900000-0000-4000-8000-000000000044');

select ok(
  not has_function_privilege(
    'authenticated',
    'private.submit_education_learner_attempt(uuid,uuid,uuid,text,integer,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.submit_education_learner_attempt(uuid,uuid,uuid,text,integer,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.education_learner_course_quiz_links(uuid,uuid)',
    'execute'
  ),
  'client roles cannot execute the learner submit helpers'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.submit_education_learner_attempt(uuid,uuid,uuid,text,integer,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.education_learner_attempt_payload(uuid,boolean)',
    'execute'
  ),
  'only service_role can execute the submit function'
);

set local role authenticated;
select throws_ok(
  $$select private.submit_education_learner_attempt(
    'c1900000-0000-4000-8000-000000000010'::uuid,
    'c1900000-0000-4000-8000-000000000001'::uuid,
    'c1900000-0000-4000-8000-000000000020'::uuid,
    'denied',
    null,
    '[]'::jsonb
  )$$,
  '42501',
  null,
  'authenticated cannot execute submit'
);
reset role;
set local role service_role;

select throws_ok(
  $$select private.submit_education_learner_attempt(
    'c1900000-0000-4000-8000-000000000010'::uuid,
    'c1900000-0000-4000-8000-000000000002'::uuid,
    'c1900000-0000-4000-8000-000000000020'::uuid,
    'unlinked',
    null,
    '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
  )$$,
  '42501',
  null,
  'a platform user with no workspace student is rejected'
);

select throws_ok(
  $$select private.submit_education_learner_attempt(
    'c1900000-0000-4000-8000-000000000010'::uuid,
    'c1900000-0000-4000-8000-000000000001'::uuid,
    'c1900000-0000-4000-8000-000000000021'::uuid,
    'other-course',
    null,
    '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
  )$$,
  '42501',
  null,
  'another course in the same workspace is rejected'
);

select throws_ok(
  $$select private.submit_education_learner_attempt(
    'c1900000-0000-4000-8000-000000000010'::uuid,
    'c1900000-0000-4000-8000-000000000001'::uuid,
    'c1900000-0000-4000-8000-000000000020'::uuid,
    'unlinked-quiz',
    null,
    '[{"quiz_id":"c1900000-0000-4000-8000-000000000045","selected_option_id":"c1900000-0000-4000-8000-000000000056"}]'::jsonb
  )$$,
  '23514',
  null,
  'a workspace quiz outside the course is rejected'
);

create temp table learner_submit_first (payload jsonb);
insert into learner_submit_first (payload)
select private.submit_education_learner_attempt(
  'c1900000-0000-4000-8000-000000000010'::uuid,
  'c1900000-0000-4000-8000-000000000001'::uuid,
  'c1900000-0000-4000-8000-000000000020'::uuid,
  'key-1',
  null,
  '[
    {"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051","is_correct":false},
    {"quiz_id":"c1900000-0000-4000-8000-000000000042","selected_option_id":"c1900000-0000-4000-8000-000000000052","is_correct":false},
    {"quiz_id":"c1900000-0000-4000-8000-000000000043","selected_option_id":"c1900000-0000-4000-8000-000000000053","is_correct":false},
    {"quiz_id":"c1900000-0000-4000-8000-000000000044","selected_option_id":"c1900000-0000-4000-8000-000000000054","is_correct":true}
  ]'::jsonb
);

select is(
  (select (payload -> 'attempt' ->> 'correct_count')::integer from learner_submit_first),
  3,
  'the stored option is graded and the client flag is ignored'
);
select is(
  (select (payload -> 'attempt' ->> 'total_score')::real from learner_submit_first),
  7::real,
  'points win, then the quiz score, and a wrong answer scores zero'
);
select is(
  (select (payload -> 'attempt' ->> 'question_count')::integer from learner_submit_first),
  4,
  'a quiz linked both ways counts once'
);
select ok(
  (select payload -> 'completed_module_ids' from learner_submit_first)
    ? 'c1900000-0000-4000-8000-000000000031'
  and (select payload -> 'completed_module_ids' from learner_submit_first)
    ? 'c1900000-0000-4000-8000-000000000032'
  and not (
    (select payload -> 'completed_module_ids' from learner_submit_first)
      ? 'c1900000-0000-4000-8000-000000000033'
  ),
  'direct and set modules complete only when every linked quiz is correct'
);

create temp table learner_submit_replay (payload jsonb);
insert into learner_submit_replay (payload)
select private.submit_education_learner_attempt(
  'c1900000-0000-4000-8000-000000000010'::uuid,
  'c1900000-0000-4000-8000-000000000001'::uuid,
  'c1900000-0000-4000-8000-000000000020'::uuid,
  'key-1',
  null,
  '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
);

select is(
  (select payload -> 'attempt' ->> 'id' from learner_submit_replay),
  (select payload -> 'attempt' ->> 'id' from learner_submit_first),
  'the same idempotency key returns the original attempt'
);
select is(
  (
    select count(*)::integer
    from private.education_learner_quiz_attempts
    where user_id = 'c1900000-0000-4000-8000-000000000001'
  ),
  1,
  'a replay does not store another attempt'
);

select is(
  (
    private.submit_education_learner_attempt(
      'c1900000-0000-4000-8000-000000000010'::uuid,
      'c1900000-0000-4000-8000-000000000001'::uuid,
      'c1900000-0000-4000-8000-000000000020'::uuid,
      'key-2',
      null,
      '[
        {"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"},
        {"quiz_id":"c1900000-0000-4000-8000-000000000042","selected_option_id":"c1900000-0000-4000-8000-000000000052"},
        {"quiz_id":"c1900000-0000-4000-8000-000000000043","selected_option_id":"c1900000-0000-4000-8000-000000000053"},
        {"quiz_id":"c1900000-0000-4000-8000-000000000044","selected_option_id":"c1900000-0000-4000-8000-000000000055"}
      ]'::jsonb
    ) -> 'attempt' ->> 'attempt_number'
  )::integer,
  2,
  'the next attempt takes the following number'
);
select ok(
  exists (
    select 1
    from private.education_learner_module_progress
    where user_id = 'c1900000-0000-4000-8000-000000000001'
      and module_id = 'c1900000-0000-4000-8000-000000000033'
  ),
  'the mixed module completes once every distinct quiz is correct'
);

select is(
  (
    select count(*)::integer
    from (
      select private.submit_education_learner_attempt(
        'c1900000-0000-4000-8000-000000000010'::uuid,
        'c1900000-0000-4000-8000-000000000001'::uuid,
        'c1900000-0000-4000-8000-000000000020'::uuid,
        'rate-' || g::text,
        null,
        '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
      )
      from generate_series(3, 10) as g
    ) as filled
  ),
  8,
  'attempts through the tenth in the window are stored'
);

select throws_ok(
  $$select private.submit_education_learner_attempt(
    'c1900000-0000-4000-8000-000000000010'::uuid,
    'c1900000-0000-4000-8000-000000000001'::uuid,
    'c1900000-0000-4000-8000-000000000020'::uuid,
    'rate-11',
    null,
    '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
  )$$,
  'P4290',
  null,
  'the eleventh attempt in the window is rejected'
);

select is(
  (
    select count(*)::integer
    from private.education_learner_quiz_attempts
    where user_id = 'c1900000-0000-4000-8000-000000000001'
  ),
  10,
  'a rate-limited attempt is not stored'
);

select is(
  (
    select payload -> 'attempt' ->> 'id'
    from learner_submit_replay
  ),
  (
    select private.submit_education_learner_attempt(
      'c1900000-0000-4000-8000-000000000010'::uuid,
      'c1900000-0000-4000-8000-000000000001'::uuid,
      'c1900000-0000-4000-8000-000000000020'::uuid,
      'key-1',
      null,
      '[{"quiz_id":"c1900000-0000-4000-8000-000000000041","selected_option_id":"c1900000-0000-4000-8000-000000000051"}]'::jsonb
    ) -> 'attempt' ->> 'id'
  ),
  'a replay during the limit still returns the original attempt'
);

select finish();
rollback;
