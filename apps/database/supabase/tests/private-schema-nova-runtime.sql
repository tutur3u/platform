begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(40);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members'),
        ('nova_submissions_with_scores'),
        ('nova_user_leaderboard'),
        ('nova_user_challenge_leaderboard'),
        ('nova_team_leaderboard'),
        ('nova_team_challenge_leaderboard')
    ) as relations(relation_name)
    where to_regclass(format('public.%I', relation_name)) is not null
  ),
  'Nova runtime relations are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members'),
        ('nova_submissions_with_scores'),
        ('nova_user_leaderboard'),
        ('nova_user_challenge_leaderboard'),
        ('nova_team_leaderboard'),
        ('nova_team_challenge_leaderboard')
    ) as relations(relation_name)
    where to_regclass(format('private.%I', relation_name)) is null
  ),
  'Nova runtime relations exist in the private schema'
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
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members'),
        ('nova_submissions_with_scores'),
        ('nova_user_leaderboard'),
        ('nova_user_challenge_leaderboard'),
        ('nova_team_leaderboard'),
        ('nova_team_challenge_leaderboard')
    ) as relations(relation_name)
    where has_table_privilege(
      'anon',
      format('private.%I', relation_name),
      'select'
    )
  ),
  'anon cannot select private Nova runtime relations'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private Nova runtime tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members')
    ) as tables(table_name)
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
      privilege_name
    )
  ),
  'service role can select and mutate private Nova runtime tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_submissions_with_scores'),
        ('nova_user_leaderboard'),
        ('nova_user_challenge_leaderboard'),
        ('nova_team_leaderboard'),
        ('nova_team_challenge_leaderboard')
    ) as views(view_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', view_name),
      'select'
    )
  ),
  'service role can select private Nova runtime views'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members')
    ) as tables(table_name)
    where not (
      select relrowsecurity
      from pg_class
      where oid = format('private.%I', table_name)::regclass
    )
  ),
  'private Nova runtime tables have RLS enabled'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_challenge_whitelisted_emails'),
        ('nova_sessions'),
        ('nova_submission_criteria'),
        ('nova_submissions'),
        ('nova_team_emails'),
        ('nova_team_members')
    ) as tables(table_name)
    where not exists (
      select 1
      from pg_policies
      where schemaname = 'private'
        and tablename = table_name
        and policyname = 'Service role can manage private Nova runtime rows'
    )
  ),
  'private Nova runtime tables have service-role policies'
);

select ok(
  not exists (
    select 1
    from (
      values
        (
          'private.nova_challenge_whitelisted_emails'::regclass,
          'nova_challenge_whitelisted_emails_challenge_id_fkey',
          'private.nova_challenges'::regclass
        ),
        (
          'private.nova_sessions'::regclass,
          'nova_sessions_challenge_id_fkey',
          'private.nova_challenges'::regclass
        ),
        (
          'private.nova_submission_criteria'::regclass,
          'nova_submission_criteria_criteria_id_fkey',
          'private.nova_challenge_criteria'::regclass
        ),
        (
          'private.nova_submission_criteria'::regclass,
          'nova_submission_criteria_submission_id_fkey',
          'private.nova_submissions'::regclass
        ),
        (
          'private.nova_submissions'::regclass,
          'nova_submissions_problem_id_fkey',
          'private.nova_problems'::regclass
        ),
        (
          'private.nova_submissions'::regclass,
          'nova_submissions_session_id_fkey',
          'private.nova_sessions'::regclass
        ),
        (
          'private.nova_team_emails'::regclass,
          'nova_team_emails_team_id_fkey',
          'private.nova_teams'::regclass
        ),
        (
          'private.nova_team_members'::regclass,
          'nova_team_members_team_id_fkey',
          'private.nova_teams'::regclass
        )
    ) as expected(conrelid, conname, confrelid)
    where not exists (
      select 1
      from pg_constraint
      where pg_constraint.conrelid = expected.conrelid
        and pg_constraint.conname = expected.conname
        and pg_constraint.confrelid = expected.confrelid
    )
  ),
  'private Nova runtime foreign keys point to private Nova parents'
);

select ok(
  not exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    join pg_class referenced_relation
      on referenced_relation.oid = dependency.refobjid
    join pg_namespace referenced_namespace
      on referenced_namespace.oid = referenced_relation.relnamespace
    where rewrite_rule.ev_class in (
      'private.nova_submissions_with_scores'::regclass,
      'private.nova_user_leaderboard'::regclass,
      'private.nova_user_challenge_leaderboard'::regclass,
      'private.nova_team_leaderboard'::regclass,
      'private.nova_team_challenge_leaderboard'::regclass
    )
      and referenced_namespace.nspname = 'public'
      and referenced_relation.relname like 'nova_%'
  ),
  'private Nova runtime views do not depend on public Nova relations'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_get_all_challenges_with_user_stats(uuid)'),
        ('nova_get_challenge_with_user_stats(uuid,uuid)'),
        ('nova_get_user_daily_sessions(uuid,uuid)'),
        ('nova_get_user_total_sessions(uuid,uuid)'),
        ('is_nova_user_email_in_team(text,uuid)'),
        ('is_nova_user_id_in_team(uuid,uuid)'),
        ('update_expired_sessions()')
    ) as functions(signature)
    where to_regprocedure('private.' || signature) is null
  ),
  'Nova runtime RPC helpers exist in the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('nova_get_all_challenges_with_user_stats(uuid)'),
        ('nova_get_challenge_with_user_stats(uuid,uuid)'),
        ('nova_get_user_daily_sessions(uuid,uuid)'),
        ('nova_get_user_total_sessions(uuid,uuid)'),
        ('is_nova_user_email_in_team(text,uuid)'),
        ('is_nova_user_id_in_team(uuid,uuid)'),
        ('update_expired_sessions()'),
        ('update_session_total_score(uuid,uuid)')
    ) as functions(signature)
    where to_regprocedure('public.' || signature) is not null
  ),
  'Nova runtime RPC helpers are not left in the public schema'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'nova_get_all_challenges_with_user_stats',
        'nova_get_challenge_with_user_stats',
        'nova_get_user_daily_sessions',
        'nova_get_user_total_sessions',
        'is_nova_user_email_in_team',
        'is_nova_user_id_in_team',
        'update_expired_sessions'
      )
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
        where config.value = 'search_path=private, public, pg_temp'
      )
  ),
  'private Nova runtime RPC helpers resolve private before public'
);

select is(
  (
    select command
    from cron.job
    where jobname = 'update_expired_sessions_job'
  ),
  'SELECT private.update_expired_sessions();',
  'Nova session expiration cron calls the private helper'
);

set local role service_role;

select ok(
  exists (
    select 1
    from public.users
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Nova runtime pgTAP uses an existing seeded test user'
);

select lives_ok(
  $$
    insert into private.nova_challenges (
      id,
      title,
      description,
      duration
    ) values (
      '10000000-0000-0000-0000-000000000931',
      'pgTAP private Nova runtime challenge',
      'created by private schema pgTAP',
      3600
    )
  $$,
  'service role can create a private runtime challenge parent'
);

select lives_ok(
  $$
    insert into private.nova_challenge_criteria (
      id,
      challenge_id,
      name,
      description
    ) values (
      '10000000-0000-0000-0000-000000000932',
      '10000000-0000-0000-0000-000000000931',
      'Accuracy',
      'Accurate response'
    )
  $$,
  'service role can create private runtime criteria parent'
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
      '10000000-0000-0000-0000-000000000933',
      '10000000-0000-0000-0000-000000000931',
      'Private runtime problem',
      'created by private schema pgTAP',
      'input',
      'output',
      512
    )
  $$,
  'service role can create private runtime problem parent'
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
      '10000000-0000-0000-0000-000000000934',
      '10000000-0000-0000-0000-000000000933',
      'input',
      'output',
      false
    )
  $$,
  'service role can create private runtime problem test case parent'
);

select lives_ok(
  $$
    insert into private.nova_teams (
      id,
      name,
      description
    ) values (
      '10000000-0000-0000-0000-000000000935',
      'pgTAP private Nova runtime team',
      'created by private schema pgTAP'
    )
  $$,
  'service role can create a private runtime team parent'
);

select lives_ok(
  $$
    insert into private.nova_challenge_whitelisted_emails (
      challenge_id,
      email
    ) values (
      '10000000-0000-0000-0000-000000000931',
      'runtime-pgtap@example.com'
    )
  $$,
  'service role can insert private Nova challenge whitelists'
);

select lives_ok(
  $$
    insert into private.nova_team_emails (
      team_id,
      email
    ) values (
      '10000000-0000-0000-0000-000000000935',
      'runtime-pgtap@example.com'
    )
  $$,
  'service role can insert private Nova team emails'
);

select lives_ok(
  $$
    insert into private.nova_team_members (
      team_id,
      user_id
    ) values (
      '10000000-0000-0000-0000-000000000935',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  'service role can insert private Nova team members'
);

select lives_ok(
  $$
    insert into private.nova_sessions (
      id,
      challenge_id,
      user_id,
      status,
      start_time
    ) values (
      '10000000-0000-0000-0000-000000000936',
      '10000000-0000-0000-0000-000000000931',
      '00000000-0000-0000-0000-000000000001',
      'STARTED',
      now()
    )
  $$,
  'service role can insert private Nova sessions'
);

select lives_ok(
  $$
    insert into private.nova_submissions (
      id,
      problem_id,
      session_id,
      user_id,
      prompt
    ) values (
      '10000000-0000-0000-0000-000000000937',
      '10000000-0000-0000-0000-000000000933',
      '10000000-0000-0000-0000-000000000936',
      '00000000-0000-0000-0000-000000000001',
      'solve it'
    )
  $$,
  'service role can insert private Nova submissions'
);

select lives_ok(
  $$
    insert into private.nova_submission_criteria (
      submission_id,
      criteria_id,
      score,
      feedback
    ) values (
      '10000000-0000-0000-0000-000000000937',
      '10000000-0000-0000-0000-000000000932',
      10,
      'good'
    )
  $$,
  'service role can insert private Nova submission criteria'
);

select lives_ok(
  $$
    insert into private.nova_submission_test_cases (
      submission_id,
      test_case_id,
      output,
      matched
    ) values (
      '10000000-0000-0000-0000-000000000937',
      '10000000-0000-0000-0000-000000000934',
      'output',
      true
    )
  $$,
  'service role can insert private Nova submission test cases'
);

select is(
  (
    select total_score
    from private.nova_submissions_with_scores
    where id = '10000000-0000-0000-0000-000000000937'
  ),
  10::double precision,
  'private Nova submissions score view reads private runtime rows'
);

select is(
  (
    select score
    from private.nova_user_leaderboard
    where user_id = '00000000-0000-0000-0000-000000000001'
  ),
  10::double precision,
  'private Nova user leaderboard reads private runtime rows'
);

select is(
  (
    select score
    from private.nova_team_leaderboard
    where team_id = '10000000-0000-0000-0000-000000000935'
  ),
  10::double precision,
  'private Nova team leaderboard reads private runtime rows'
);

select is(
  private.nova_get_user_total_sessions(
    '10000000-0000-0000-0000-000000000931',
    '00000000-0000-0000-0000-000000000001'
  ),
  1,
  'private Nova total-session RPC reads private sessions'
);

select ok(
  private.is_nova_user_email_in_team(
    'runtime-pgtap@example.com',
    '10000000-0000-0000-0000-000000000935'
  ),
  'private Nova team-email helper reads private team emails'
);

select ok(
  private.is_nova_user_id_in_team(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000935'
  ),
  'private Nova team-member helper reads private team members'
);

select lives_ok(
  $$ select private.update_expired_sessions() $$,
  'private Nova session expiration helper runs'
);

select lives_ok(
  $$
    update private.nova_submissions
    set prompt = 'updated prompt'
    where id = '10000000-0000-0000-0000-000000000937'
  $$,
  'service role can update private Nova submissions'
);

select is(
  (
    select prompt
    from private.nova_submissions
    where id = '10000000-0000-0000-0000-000000000937'
  ),
  'updated prompt',
  'private Nova submission updates are visible to service role'
);

select lives_ok(
  $$
    delete from private.nova_teams
    where id = '10000000-0000-0000-0000-000000000935'
  $$,
  'service role can delete private Nova team runtime rows'
);

select lives_ok(
  $$
    delete from private.nova_challenges
    where id = '10000000-0000-0000-0000-000000000931'
  $$,
  'service role can delete private Nova challenge runtime rows'
);

select * from finish();

rollback;
