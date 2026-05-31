begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  to_regclass('public.workspace_scheduling_metadata') is null,
  'scheduling metadata is no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_scheduling_metadata') is not null,
  'scheduling metadata exists in the private schema'
);

select ok(
  to_regprocedure(
    'public.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)'
  ) is null,
  'public scheduling metadata upsert helper was removed'
);

select ok(
  to_regprocedure(
    'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)'
  ) is not null,
  'scheduling metadata upsert helper exists in the private schema'
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
  not has_table_privilege(
    'anon',
    'private.workspace_scheduling_metadata',
    'select'
  ),
  'anon cannot select private scheduling metadata'
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
      'private.workspace_scheduling_metadata',
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private scheduling metadata'
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
      'private.workspace_scheduling_metadata',
      privilege_name
    )
  ),
  'service role can select and mutate private scheduling metadata'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_scheduling_metadata'::regclass
  ),
  'private scheduling metadata has RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_scheduling_metadata'
      and policyname = 'Service role can manage private scheduling metadata'
  ),
  'private scheduling metadata has a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_scheduling_metadata_ws_id_fkey'
      and conrelid = 'private.workspace_scheduling_metadata'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'scheduling metadata still references public workspaces'
);

select ok(
  to_regclass('private.idx_workspace_scheduling_metadata_ws_id') is not null,
  'scheduling metadata workspace index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_scheduling_metadata'::regclass
      and tgname = 'workspace_scheduling_metadata_updated_at'
      and not tgisinternal
  ),
  'scheduling metadata updated-at trigger moved with the private table'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'client roles cannot execute the private scheduling metadata helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'service role can execute the private scheduling metadata helper'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)'::regprocedure
      and 'search_path=public, private, pg_temp' = any(coalesce(proconfig, '{}'))
  ),
  'private scheduling metadata helper can resolve public and private objects'
);

select ok(
  pg_get_functiondef(
    'private.upsert_scheduling_metadata(uuid,text,text,integer,integer,integer,integer,integer)'::regprocedure
  ) like '%private.workspace_scheduling_metadata%',
  'private scheduling metadata helper writes to the private table'
);

select * from finish();

rollback;
