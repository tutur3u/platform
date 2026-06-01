-- Move the Nova challenge catalog and scoring test tables off the public Data
-- API surface.
--
-- Public submission/session tables keep their existing foreign keys, but
-- challenge definitions, problem definitions, criteria, and test results are
-- now server-owned private schema relations.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nova_challenges',
    'nova_challenge_criteria',
    'nova_problems',
    'nova_problem_test_cases',
    'nova_submission_test_cases'
  ]
  loop
    execute format(
      'alter table if exists public.%I set schema private',
      table_name
    );

    execute format(
      'revoke all on table private.%I from public, anon, authenticated',
      table_name
    );

    execute format('grant all on table private.%I to service_role', table_name);
    execute format('alter table private.%I enable row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'nova_challenges',
        'nova_challenge_criteria',
        'nova_problems',
        'nova_problem_test_cases',
        'nova_submission_test_cases'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nova_challenges',
    'nova_challenge_criteria',
    'nova_problems',
    'nova_problem_test_cases',
    'nova_submission_test_cases'
  ]
  loop
    execute format(
      'create policy %I on private.%I for all to service_role using (true) with check (true)',
      'Service role can manage private ' || table_name,
      table_name
    );
  end loop;
end;
$$;

alter view if exists public.nova_submissions_with_scores
  set (security_invoker = true);

alter view if exists public.nova_user_leaderboard
  set (security_invoker = true);

alter view if exists public.nova_user_challenge_leaderboard
  set (security_invoker = true);

alter view if exists public.nova_team_leaderboard
  set (security_invoker = true);

alter view if exists public.nova_team_challenge_leaderboard
  set (security_invoker = true);

do $$
declare
  function_record record;
begin
  for function_record in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and (
        pg_get_functiondef(p.oid) ilike '%nova_challenge%'
        or pg_get_functiondef(p.oid) ilike '%nova_problem%'
        or pg_get_functiondef(p.oid) ilike '%nova_submission_test_cases%'
      )
    order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = private, public, pg_temp',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end;
$$;
