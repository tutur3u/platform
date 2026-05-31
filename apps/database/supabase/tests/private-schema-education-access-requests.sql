begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(20);

select ok(
  to_regclass('public.workspace_education_access_requests') is null,
  'education access requests are no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_education_access_requests') is not null,
  'education access requests exist in the private schema'
);

select ok(
  to_regprocedure(
    'public.update_workspace_education_access_requests_updated_at()'
  ) is null,
  'public education access request timestamp helper was removed'
);

select ok(
  to_regprocedure(
    'private.update_workspace_education_access_requests_updated_at()'
  ) is not null,
  'education access request timestamp helper exists in the private schema'
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
    'private.workspace_education_access_requests',
    'select'
  ),
  'anon cannot select private education access requests'
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
      'private.workspace_education_access_requests',
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private education access requests'
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
      'private.workspace_education_access_requests',
      privilege_name
    )
  ),
  'service role can select and mutate private education access requests'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_education_access_requests'::regclass
  ),
  'private education access requests have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_education_access_requests'
      and policyname = 'Service role can manage private education access requests'
  ),
  'private education access requests have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_education_access_requests_ws_id_fkey'
      and conrelid = 'private.workspace_education_access_requests'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'education access requests still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_education_access_requests_creator_id_fkey'
      and conrelid = 'private.workspace_education_access_requests'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'education access requests still reference public creator users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_education_access_requests_reviewed_by_fkey'
      and conrelid = 'private.workspace_education_access_requests'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'education access requests still reference public reviewer users'
);

select ok(
  to_regclass('private.workspace_education_access_requests_unique_pending') is not null,
  'education access request pending uniqueness index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_education_access_requests'::regclass
      and tgname = 'workspace_education_access_requests_updated_at'
      and not tgisinternal
  ),
  'education access request updated-at trigger exists on the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger
    join pg_proc proc on proc.oid = trigger.tgfoid
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where trigger.tgrelid = 'private.workspace_education_access_requests'::regclass
      and trigger.tgname = 'workspace_education_access_requests_updated_at'
      and namespace.nspname = 'private'
      and proc.proname = 'update_workspace_education_access_requests_updated_at'
  ),
  'education access request trigger uses the private helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.update_workspace_education_access_requests_updated_at()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.update_workspace_education_access_requests_updated_at()',
    'execute'
  ),
  'client roles cannot execute the private education access request helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.update_workspace_education_access_requests_updated_at()',
    'execute'
  ),
  'service role can execute the private education access request helper'
);

select lives_ok(
  $$
  set local role service_role;

  insert into private.workspace_education_access_requests (
    ws_id,
    workspace_name,
    creator_id,
    message,
    status
  ) values (
    '00000000-0000-0000-0000-000000000000',
    'Root workspace',
    '00000000-0000-0000-0000-000000000001',
    'pgTAP private-schema write',
    'rejected'
  );

  update private.workspace_education_access_requests
  set admin_notes = 'pgTAP private-schema update'
  where message = 'pgTAP private-schema write';

  reset role;
  $$,
  'service role can write and update private education access requests'
);

select * from finish();

rollback;
