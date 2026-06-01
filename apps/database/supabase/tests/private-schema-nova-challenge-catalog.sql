begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(26);

create temporary table private_nova_catalog_tables(table_name text primary key)
on commit drop;

insert into private_nova_catalog_tables(table_name)
values
  ('nova_challenges'),
  ('nova_challenge_criteria'),
  ('nova_problems'),
  ('nova_problem_test_cases'),
  ('nova_submission_test_cases');

select ok(
  not exists (
    select 1
    from private_nova_catalog_tables
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'Nova challenge catalog tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from private_nova_catalog_tables
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'Nova challenge catalog tables exist in the private schema'
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
  not exists (
    select 1
    from private_nova_catalog_tables
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      roles.role_name,
      format('private.%I', table_name),
      privileges.privilege_name
    )
  ),
  'anon and authenticated cannot select or mutate private Nova catalog tables'
);

select ok(
  not exists (
    select 1
    from private_nova_catalog_tables
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private Nova catalog tables'
);

select ok(
  not exists (
    select 1
    from private_nova_catalog_tables
    join pg_class cls
      on cls.oid = format('private.%I', table_name)::regclass
    where not cls.relrowsecurity
  ),
  'private Nova catalog tables have RLS enabled'
);

select ok(
  not exists (
    select 1
    from private_nova_catalog_tables
    where not exists (
      select 1
      from pg_policies
      where schemaname = 'private'
        and tablename = private_nova_catalog_tables.table_name
        and policyname =
          'Service role can manage private ' ||
          private_nova_catalog_tables.table_name
    )
  ),
  'private Nova catalog tables have service-role policies'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (select table_name from private_nova_catalog_tables)
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private Nova catalog tables have no direct anon/authenticated/public policies'
);

create temporary table expected_nova_catalog_fks(
  child_table regclass,
  constraint_name text,
  parent_table regclass
) on commit drop;

insert into expected_nova_catalog_fks(
  child_table,
  constraint_name,
  parent_table
)
values
  (
    'private.nova_challenge_criteria'::regclass,
    'nova_challenge_criteria_challenge_id_fkey',
    'private.nova_challenges'::regclass
  ),
  (
    'private.nova_challenge_manager_emails'::regclass,
    'nova_challenge_manager_emails_challenge_id_fkey',
    'private.nova_challenges'::regclass
  ),
  (
    'private.nova_challenge_whitelisted_emails'::regclass,
    'nova_challenge_whitelisted_emails_challenge_id_fkey',
    'private.nova_challenges'::regclass
  ),
  (
    'private.nova_problems'::regclass,
    'nova_problems_challenge_id_fkey',
    'private.nova_challenges'::regclass
  ),
  (
    'private.nova_sessions'::regclass,
    'nova_sessions_challenge_id_fkey',
    'private.nova_challenges'::regclass
  ),
  (
    'private.nova_problem_test_cases'::regclass,
    'nova_problem_testcases_problem_id_fkey',
    'private.nova_problems'::regclass
  ),
  (
    'private.nova_submissions'::regclass,
    'nova_submissions_problem_id_fkey',
    'private.nova_problems'::regclass
  ),
  (
    'private.nova_submission_criteria'::regclass,
    'nova_submission_criteria_criteria_id_fkey',
    'private.nova_challenge_criteria'::regclass
  ),
  (
    'private.nova_submission_test_cases'::regclass,
    'nova_submission_test_cases_submission_id_fkey',
    'private.nova_submissions'::regclass
  ),
  (
    'private.nova_submission_test_cases'::regclass,
    'nova_submission_test_cases_test_case_id_fkey',
    'private.nova_problem_test_cases'::regclass
  );

select ok(
  not exists (
    select 1
    from expected_nova_catalog_fks expected
    where not exists (
      select 1
      from pg_constraint
      where conname = expected.constraint_name
        and conrelid = expected.child_table
        and confrelid = expected.parent_table
    )
  ),
  'Nova catalog foreign keys target their private parent tables'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class =
      'private.nova_submissions_with_scores'::regclass
      and dependency.refobjid = 'private.nova_problem_test_cases'::regclass
  ),
  'Nova submission score view resolves private problem test cases'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class =
      'private.nova_submissions_with_scores'::regclass
      and dependency.refobjid = 'private.nova_submission_test_cases'::regclass
  ),
  'Nova submission score view resolves private submission test cases'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class =
      'private.nova_team_challenge_leaderboard'::regclass
      and dependency.refobjid = 'private.nova_challenges'::regclass
  ),
  'Nova team challenge leaderboard resolves private challenges'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class =
      'private.nova_user_challenge_leaderboard'::regclass
      and dependency.refobjid = 'private.nova_challenges'::regclass
  ),
  'Nova user challenge leaderboard resolves private challenges'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and (
        pg_get_functiondef(p.oid) ilike '%nova_challenge%'
        or pg_get_functiondef(p.oid) ilike '%nova_problem%'
        or pg_get_functiondef(p.oid) ilike '%nova_submission_test_cases%'
      )
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
        where config.value = 'search_path=private, public, pg_temp'
      )
  ),
  'Nova catalog functions resolve private before public in their search path'
);

set local role service_role;

select lives_ok(
  $$
    insert into private.nova_challenges (
      id,
      title,
      description,
      duration
    ) values (
      '10000000-0000-0000-0000-000000000911',
      'pgTAP private Nova challenge',
      'created by private schema pgTAP',
      3600
    )
  $$,
  'service role can insert private Nova challenges'
);

select lives_ok(
  $$
    insert into private.nova_challenge_criteria (
      id,
      challenge_id,
      name,
      description
    ) values (
      '10000000-0000-0000-0000-000000000912',
      '10000000-0000-0000-0000-000000000911',
      'Correctness',
      'Validate correctness'
    )
  $$,
  'service role can insert private Nova challenge criteria'
);

select lives_ok(
  $$
    insert into private.nova_problems (
      id,
      challenge_id,
      title,
      description,
      example_input,
      example_output,
      max_prompt_length
    ) values (
      '10000000-0000-0000-0000-000000000913',
      '10000000-0000-0000-0000-000000000911',
      'Private Nova problem',
      'created by private schema pgTAP',
      'input',
      'output',
      512
    )
  $$,
  'service role can insert private Nova problems'
);

select lives_ok(
  $$
    insert into private.nova_problem_test_cases (
      id,
      problem_id,
      input,
      output,
      hidden
    ) values (
      '10000000-0000-0000-0000-000000000914',
      '10000000-0000-0000-0000-000000000913',
      'input',
      'output',
      false
    )
  $$,
  'service role can insert private Nova problem test cases'
);

select lives_ok(
  $$
    insert into private.nova_submissions (
      id,
      problem_id,
      user_id,
      prompt
    ) values (
      '10000000-0000-0000-0000-000000000915',
      '10000000-0000-0000-0000-000000000913',
      '00000000-0000-0000-0000-000000000001',
      'solve it'
    )
  $$,
  'service role can insert private submissions for private problems'
);

select lives_ok(
  $$
    insert into private.nova_submission_test_cases (
      submission_id,
      test_case_id,
      output,
      matched
    ) values (
      '10000000-0000-0000-0000-000000000915',
      '10000000-0000-0000-0000-000000000914',
      'output',
      true
    )
  $$,
  'service role can insert private Nova submission test cases'
);

select is(
  (
    select output
    from private.nova_submission_test_cases
    where submission_id = '10000000-0000-0000-0000-000000000915'
      and test_case_id = '10000000-0000-0000-0000-000000000914'
  ),
  'output',
  'service role can read private Nova submission test cases'
);

select lives_ok(
  $$
    update private.nova_problem_test_cases
    set hidden = true
    where id = '10000000-0000-0000-0000-000000000914'
  $$,
  'service role can update private Nova problem test cases'
);

select is(
  (
    select hidden
    from private.nova_problem_test_cases
    where id = '10000000-0000-0000-0000-000000000914'
  ),
  true,
  'private Nova problem test case updates are visible to service role'
);

select lives_ok(
  $$
    delete from private.nova_challenges
    where id = '10000000-0000-0000-0000-000000000911'
  $$,
  'service role can delete private Nova challenges'
);

select is(
  (
    select count(*)::integer
    from private.nova_problems
    where id = '10000000-0000-0000-0000-000000000913'
  ),
  0,
  'deleting a private Nova challenge cascades private problems'
);

select * from finish();

rollback;
