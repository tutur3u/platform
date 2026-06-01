begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(21);

select ok(
  to_regclass('public.nova_teams') is null,
  'Nova teams are no longer in the public schema'
);

select ok(
  to_regclass('private.nova_teams') is not null,
  'Nova teams exist in the private schema'
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
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.nova_teams',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private Nova teams'
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
      'private.nova_teams',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private Nova teams'
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
      'private.nova_teams',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private Nova teams'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.nova_teams'::regclass
  ),
  'private Nova teams have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'nova_teams'
      and policyname = 'Service role can manage private Nova teams'
  ),
  'private Nova teams have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'nova_teams'
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private Nova teams have no direct anon/authenticated/public policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'nova_team_members_team_id_fkey'
      and conrelid = 'private.nova_team_members'::regclass
      and confrelid = 'private.nova_teams'::regclass
  ),
  'private Nova team members reference private Nova teams'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'nova_team_emails_team_id_fkey'
      and conrelid = 'private.nova_team_emails'::regclass
      and confrelid = 'private.nova_teams'::regclass
  ),
  'private Nova team invitations reference private Nova teams'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class = 'private.nova_team_leaderboard'::regclass
      and dependency.refobjid = 'private.nova_teams'::regclass
  ),
  'Nova team leaderboard resolves private Nova teams'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class =
      'private.nova_team_challenge_leaderboard'::regclass
      and dependency.refobjid = 'private.nova_teams'::regclass
  ),
  'Nova team challenge leaderboard resolves private Nova teams'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_users'
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
        where config.value = 'search_path=private, public, pg_temp'
      )
  ),
  'Nova user search resolves private teams before public tables'
);

set local role service_role;

select lives_ok(
  $$
    insert into private.nova_teams (
      id,
      name,
      description,
      goals
    ) values (
      '10000000-0000-0000-0000-000000000901',
      'pgTAP private Nova team',
      'created by private schema pgTAP',
      'validate private access'
    )
  $$,
  'service role can insert private Nova teams'
);

select is(
  (
    select description
    from private.nova_teams
    where id = '10000000-0000-0000-0000-000000000901'
  ),
  'created by private schema pgTAP',
  'service role can read private Nova teams'
);

select lives_ok(
  $$
    update private.nova_teams
    set goals = 'validate private updates'
    where id = '10000000-0000-0000-0000-000000000901'
  $$,
  'service role can update private Nova teams'
);

select is(
  (
    select goals
    from private.nova_teams
    where id = '10000000-0000-0000-0000-000000000901'
  ),
  'validate private updates',
  'private Nova team updates are visible to service role'
);

select lives_ok(
  $$
    delete from private.nova_teams
    where id = '10000000-0000-0000-0000-000000000901'
  $$,
  'service role can delete private Nova teams'
);

select is(
  (
    select count(*)::integer
    from private.nova_teams
    where id = '10000000-0000-0000-0000-000000000901'
  ),
  0,
  'private Nova team pgTAP row is removed'
);

select * from finish();

rollback;
