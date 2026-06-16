begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.workspace_habit_trackers'::regclass
  ),
  'workspace_habit_trackers has RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.workspace_habit_tracker_entries'::regclass
  ),
  'workspace_habit_tracker_entries has RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.workspace_habit_tracker_streak_actions'::regclass
  ),
  'workspace_habit_tracker_streak_actions has RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'workspace_habit_trackers',
        'workspace_habit_tracker_entries',
        'workspace_habit_tracker_streak_actions'
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles && array['public'::name, 'anon'::name, 'authenticated'::name]
  ),
  'habit tracker tables have no client-facing write RLS policies'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_habit_trackers'
      and policyname = 'Users can view habit trackers in their workspaces'
      and cmd = 'SELECT'
      and roles && array['public'::name]
  ),
  'workspace_habit_trackers keeps workspace-member read policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_habit_tracker_entries'
      and policyname = 'Users can view habit tracker entries in their workspaces'
      and cmd = 'SELECT'
      and roles && array['public'::name]
  ),
  'workspace_habit_tracker_entries keeps workspace-member read policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_habit_tracker_streak_actions'
      and policyname = 'Users can view habit tracker streak actions in their workspaces'
      and cmd = 'SELECT'
      and roles && array['public'::name]
  ),
  'workspace_habit_tracker_streak_actions keeps workspace-member read policy'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_habit_trackers',
    'insert, update, delete'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_tracker_entries',
    'insert, update, delete'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_tracker_streak_actions',
    'insert, update, delete'
  ),
  'authenticated role has no direct habit tracker write table privileges'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.workspace_habit_trackers',
    'insert, update, delete'
  )
  and not has_table_privilege(
    'anon',
    'public.workspace_habit_tracker_entries',
    'insert, update, delete'
  )
  and not has_table_privilege(
    'anon',
    'public.workspace_habit_tracker_streak_actions',
    'insert, update, delete'
  ),
  'anon role has no direct habit tracker write table privileges'
);

select * from finish();

rollback;
