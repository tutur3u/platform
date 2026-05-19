begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

select ok(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'workspace_tutoring_sessions'
  ),
  'workspace_tutoring_sessions keeps row level security enabled'
);

select ok(
  to_regprocedure('public.enforce_workspace_tutoring_session_scope()') is not null,
  'workspace tutoring sessions keep same-workspace scope guard function'
);

select ok(
  exists (
    select 1
    from pg_trigger
    join pg_class on pg_class.oid = pg_trigger.tgrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'workspace_tutoring_sessions'
      and pg_trigger.tgname = 'workspace_tutoring_sessions_scope_guard'
      and not pg_trigger.tgisinternal
  ),
  'workspace tutoring sessions keep same-workspace scope guard trigger'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_tutoring_sessions'
      and policyname = 'Allow workspace members to view tutoring sessions'
  ),
  'broad workspace-member tutoring select policy is removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_tutoring_sessions'
      and policyname = 'Allow workspace members to manage tutoring sessions'
  ),
  'broad workspace-member tutoring manage policy is removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_tutoring_sessions'
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'tutoring sessions have no direct anon/authenticated/public RLS policy'
);

select ok(
  not has_table_privilege('anon', 'public.workspace_tutoring_sessions', 'select'),
  'anon cannot select tutoring sessions directly'
);

select ok(
  not has_table_privilege('anon', 'public.workspace_tutoring_sessions', 'insert'),
  'anon cannot insert tutoring sessions directly'
);

select ok(
  not has_table_privilege('anon', 'public.workspace_tutoring_sessions', 'update'),
  'anon cannot update tutoring sessions directly'
);

select ok(
  not has_table_privilege('anon', 'public.workspace_tutoring_sessions', 'delete'),
  'anon cannot delete tutoring sessions directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_tutoring_sessions',
    'select'
  ),
  'authenticated cannot select tutoring sessions directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_tutoring_sessions',
    'insert'
  ),
  'authenticated cannot insert tutoring sessions directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_tutoring_sessions',
    'update'
  ),
  'authenticated cannot update tutoring sessions directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_tutoring_sessions',
    'delete'
  ),
  'authenticated cannot delete tutoring sessions directly'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.workspace_tutoring_sessions',
    'select'
  ),
  'service role can select tutoring sessions for permission-checked APIs'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.workspace_tutoring_sessions',
    'insert'
  ),
  'service role can insert tutoring sessions for permission-checked APIs'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.workspace_tutoring_sessions',
    'update'
  ),
  'service role can update tutoring sessions for permission-checked APIs'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.workspace_tutoring_sessions',
    'delete'
  ),
  'service role can delete tutoring sessions for permission-checked APIs'
);

select ok(
  exists (
    select 1
    from pg_trigger
    join pg_class on pg_class.oid = pg_trigger.tgrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'workspace_tutoring_sessions'
      and pg_trigger.tgname = 'workspace_tutoring_sessions_updated_at'
      and not pg_trigger.tgisinternal
  ),
  'workspace tutoring sessions keep updated_at trigger after RLS hardening'
);

select * from finish();

rollback;
