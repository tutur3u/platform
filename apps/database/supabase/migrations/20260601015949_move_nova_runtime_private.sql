-- Move remaining Nova runtime data and leaderboard views off the public Data API
-- surface. Nova app/server code reads and writes these relations through the
-- private schema with service-role access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

do $$
declare
  view_name text;
begin
  foreach view_name in array array[
    'nova_submissions_with_scores',
    'nova_user_leaderboard',
    'nova_user_challenge_leaderboard',
    'nova_team_leaderboard',
    'nova_team_challenge_leaderboard'
  ]
  loop
    execute format(
      'alter view if exists public.%I set schema private',
      view_name
    );

    execute format(
      'revoke all on table private.%I from public, anon, authenticated',
      view_name
    );

    execute format(
      'grant select on table private.%I to service_role',
      view_name
    );

    execute format(
      'alter view if exists private.%I set (security_invoker = true)',
      view_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nova_challenge_whitelisted_emails',
    'nova_sessions',
    'nova_submission_criteria',
    'nova_submissions',
    'nova_team_emails',
    'nova_team_members'
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
        'nova_challenge_whitelisted_emails',
        'nova_sessions',
        'nova_submission_criteria',
        'nova_submissions',
        'nova_team_emails',
        'nova_team_members'
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
    'nova_challenge_whitelisted_emails',
    'nova_sessions',
    'nova_submission_criteria',
    'nova_submissions',
    'nova_team_emails',
    'nova_team_members'
  ]
  loop
    execute format(
      'create policy %I on private.%I for all to service_role using (true) with check (true)',
      'Service role can manage private Nova runtime rows',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'nova_get_all_challenges_with_user_stats(uuid)',
    'nova_get_challenge_with_user_stats(uuid,uuid)',
    'nova_get_user_daily_sessions(uuid,uuid)',
    'nova_get_user_total_sessions(uuid,uuid)',
    'is_nova_user_email_in_team(text,uuid)',
    'is_nova_user_id_in_team(uuid,uuid)',
    'update_expired_sessions()'
  ]
  loop
    if to_regprocedure('public.' || function_signature) is not null then
      execute format(
        'alter function public.%s set schema private',
        function_signature
      );
    end if;
  end loop;
end;
$$;

drop function if exists public.update_session_total_score(uuid, uuid);

create or replace function private.is_nova_user_email_in_team(
  _user_email text,
  _team_id uuid
)
returns boolean
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  return exists (
    select 1
    from private.nova_team_emails
    where email = _user_email
      and team_id = _team_id
  );
end;
$$;

create or replace function private.is_nova_user_id_in_team(
  _user_id uuid,
  _team_id uuid
)
returns boolean
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  return exists (
    select 1
    from private.nova_team_members
    where user_id = _user_id
      and team_id = _team_id
  );
end;
$$;

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
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = private, public, pg_temp',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );

    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );

    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end;
$$;

do $$
declare
  target_job_id bigint;
begin
  select jobid
  into target_job_id
  from cron.job
  where jobname = 'update_expired_sessions_job'
    and command = 'SELECT public.update_expired_sessions();';

  if target_job_id is not null then
    perform cron.alter_job(
      job_id := target_job_id,
      command := 'SELECT private.update_expired_sessions();'
    );
  end if;
end;
$$;
