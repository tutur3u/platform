begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(15);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_create_workspace_user_with_audit_actor(uuid,jsonb,uuid)',
    'execute'
  ),
  'anon cannot execute workspace user create audit RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_create_workspace_user_with_audit_actor(uuid,jsonb,uuid)',
    'execute'
  ),
  'authenticated cannot execute workspace user create audit RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_create_workspace_user_with_audit_actor(uuid,jsonb,uuid)',
    'execute'
  ),
  'service_role can execute workspace user create audit RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_update_workspace_user_with_audit_actor(uuid,uuid,jsonb,uuid)',
    'execute'
  ),
  'anon cannot execute workspace user update audit RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_update_workspace_user_with_audit_actor(uuid,uuid,jsonb,uuid)',
    'execute'
  ),
  'authenticated cannot execute workspace user update audit RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_update_workspace_user_with_audit_actor(uuid,uuid,jsonb,uuid)',
    'execute'
  ),
  'service_role can execute workspace user update audit RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_delete_workspace_user_with_audit_actor(uuid,uuid,uuid)',
    'execute'
  ),
  'anon cannot execute workspace user delete audit RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_delete_workspace_user_with_audit_actor(uuid,uuid,uuid)',
    'execute'
  ),
  'authenticated cannot execute workspace user delete audit RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_delete_workspace_user_with_audit_actor(uuid,uuid,uuid)',
    'execute'
  ),
  'service_role can execute workspace user delete audit RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_workspace_user_audit_records(uuid,timestamptz,timestamptz)',
    'execute'
  ),
  'anon cannot execute workspace user audit record list RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_workspace_user_audit_records(uuid,timestamptz,timestamptz)',
    'execute'
  ),
  'authenticated cannot execute workspace user audit record list RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_workspace_user_audit_records(uuid,timestamptz,timestamptz)',
    'execute'
  ),
  'service_role can execute workspace user audit record list RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.backfill_workspace_user_status_changes(uuid,boolean,integer)',
    'execute'
  ),
  'anon cannot execute workspace user status backfill RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.backfill_workspace_user_status_changes(uuid,boolean,integer)',
    'execute'
  ),
  'authenticated cannot execute workspace user status backfill RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.backfill_workspace_user_status_changes(uuid,boolean,integer)',
    'execute'
  ),
  'service_role can execute workspace user status backfill RPC'
);

select * from finish();

rollback;
