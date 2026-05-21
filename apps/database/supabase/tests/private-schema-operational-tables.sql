begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  not exists (
    select 1
    from (
      values
        ('workspace_calendar_sync_log'),
        ('workspace_subscription_errors')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'moved operational tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('workspace_calendar_sync_log'),
        ('workspace_subscription_errors')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'moved operational tables exist in the private schema'
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
        ('workspace_calendar_sync_log'),
        ('workspace_subscription_errors')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
  ),
  'anon cannot select moved private operational tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('workspace_calendar_sync_log'),
        ('workspace_subscription_errors')
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
  'authenticated cannot select or mutate moved private operational tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('workspace_calendar_sync_log'),
        ('workspace_subscription_errors')
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
  'service role can select and mutate moved private operational tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_calendar_sync_log'::regclass
  ),
  'private calendar sync logs have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_subscription_errors'::regclass
  ),
  'private subscription errors have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_calendar_sync_log'
      and policyname = 'Service role can manage private calendar sync logs'
  ),
  'private calendar sync logs have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_subscription_errors'
      and policyname = 'Service role can manage private subscription errors'
  ),
  'private subscription errors have a service-role policy'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_workspace_subscription_error(uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.upsert_workspace_subscription_error(uuid,text,text)',
    'execute'
  ),
  'client roles cannot execute the subscription error upsert helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_workspace_subscription_error(uuid,text,text)',
    'execute'
  ),
  'service role can execute the subscription error upsert helper'
);

select ok(
  pg_get_functiondef(
    'public.upsert_workspace_subscription_error(uuid,text,text)'::regprocedure
  ) like '%private.workspace_subscription_errors%',
  'subscription error upsert helper writes to the private table'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.get_workspace_overview_summary()'::regprocedure
      and 'search_path=public, private, pg_temp' = any(coalesce(proconfig, '{}'))
  ),
  'workspace overview summary can resolve private subscription errors'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)'::regprocedure
      and 'search_path=public, private, pg_temp' = any(coalesce(proconfig, '{}'))
  ),
  'workspace overview rows can resolve private subscription errors'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_calendar_sync_log_status_check'
      and conrelid = 'private.workspace_calendar_sync_log'::regclass
  ),
  'calendar sync log constraints moved with the private table'
);

select ok(
  to_regclass('private.uq_workspace_subscription_errors_unresolved') is not null,
  'subscription error unique index moved with the private table'
);

select * from finish();

rollback;
