-- Client roles cannot read or change the quiz answer key.
-- service_role still can, which is how authoring and grading run.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'quiz_options'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'client roles have no quiz_options table grants'
);

select ok(
  not exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'quiz_options'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'client roles have no quiz_options column grants'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.quiz_options',
    'is_correct',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.quiz_options',
    'points',
    'SELECT'
  ),
  'authenticated cannot select is_correct or points'
);

select ok(
  has_table_privilege('service_role', 'public.quiz_options', 'SELECT')
  and has_table_privilege('service_role', 'public.quiz_options', 'INSERT')
  and has_table_privilege('service_role', 'public.quiz_options', 'UPDATE')
  and has_table_privilege('service_role', 'public.quiz_options', 'DELETE'),
  'service_role keeps authoring privileges'
);

set local role anon;
select throws_ok(
  'select is_correct from public.quiz_options',
  '42501',
  null,
  'anon select is_correct is denied'
);

reset role;
set local role authenticated;
select throws_ok(
  'select is_correct from public.quiz_options',
  '42501',
  null,
  'authenticated select is_correct is denied'
);
select throws_ok(
  'update public.quiz_options set is_correct = true',
  '42501',
  null,
  'authenticated update is_correct is denied'
);

reset role;
set local role service_role;
select lives_ok(
  'select is_correct, points from public.quiz_options limit 1',
  'service_role can read the answer key'
);

select finish();
rollback;
