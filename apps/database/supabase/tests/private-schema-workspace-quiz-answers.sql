begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(17);

select ok(
  to_regclass('private.workspace_quiz_answers') is not null,
  'workspace quiz answers live in the private schema'
);

select has_column(
  'public',
  'workspace_quizzes',
  'answer',
  'legacy public answer column remains during rollout'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  has_schema_privilege('service_role', 'private', 'usage'),
  'service role can use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.workspace_quiz_answers',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private quiz answers'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      'private.workspace_quiz_answers',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private quiz answers'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.workspace_quiz_answers',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private quiz answers'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_quiz_answers'::regclass
  ),
  'private quiz answers have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_quiz_answers'
      and policyname = 'Service role can manage private workspace quiz answers'
  ),
  'private quiz answers have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.workspace_quizzes'::regclass
      and tgname = 'capture_workspace_quiz_answer'
      and not tgisinternal
  ),
  'public quiz writes are guarded by the answer capture trigger'
);

select ok(
  to_regprocedure('private.capture_workspace_quiz_answer()') is not null,
  'private answer capture trigger function exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.capture_workspace_quiz_answer()',
    'execute'
  ),
  'authenticated cannot execute the private answer capture helper directly'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000000901')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000902',
  'Quiz Answer Security Workspace',
  false,
  '00000000-0000-0000-0000-000000000901'
)
on conflict (id) do nothing;

insert into public.workspace_quizzes (id, ws_id, question, answer)
values (
  '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-000000000902',
  'Which value is hidden?',
  '{"correct": true}'::jsonb
);

select is(
  (
    select answer
    from public.workspace_quizzes
    where id = '00000000-0000-0000-0000-000000000903'
  ),
  null::jsonb,
  'public quiz answer is nulled after insert'
);

select is(
  (
    select answer
    from private.workspace_quiz_answers
    where quiz_id = '00000000-0000-0000-0000-000000000903'
  ),
  '{"correct": true}'::jsonb,
  'private quiz answer captures the inserted key'
);

update public.workspace_quizzes
set answer = '{"correct": false}'::jsonb
where id = '00000000-0000-0000-0000-000000000903';

select is(
  (
    select answer
    from public.workspace_quizzes
    where id = '00000000-0000-0000-0000-000000000903'
  ),
  null::jsonb,
  'public quiz answer is nulled after update'
);

select is(
  (
    select answer
    from private.workspace_quiz_answers
    where quiz_id = '00000000-0000-0000-0000-000000000903'
  ),
  '{"correct": false}'::jsonb,
  'private quiz answer captures the updated key'
);

select * from finish();

rollback;
