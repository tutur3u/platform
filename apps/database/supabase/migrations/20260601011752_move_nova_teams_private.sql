-- Move Nova team metadata off the public Data API surface.
--
-- Team memberships, invitations, and leaderboard views continue to live on the
-- public surface, but the team metadata table is now server-owned and accessed
-- through private-schema service-role calls.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.nova_teams
  set schema private;

revoke all on table private.nova_teams
from public, anon, authenticated;

grant all on table private.nova_teams to service_role;

alter table private.nova_teams enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'private'
      and tablename = 'nova_teams'
  loop
    execute format(
      'drop policy if exists %I on private.nova_teams',
      policy_record.policyname
    );
  end loop;
end;
$$;

create policy "Service role can manage private Nova teams"
  on private.nova_teams
  for all
  to service_role
  using (true)
  with check (true);

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
      and pg_get_functiondef(p.oid) ilike '%nova_teams%'
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
