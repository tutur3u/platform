begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(4);

select has_function(
  'public',
  'get_workspace_users_require_attention',
  array['uuid', 'uuid[]', 'uuid'],
  'require-attention RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_workspace_users_require_attention(uuid, uuid[], uuid)',
    'execute'
  ),
  'anon cannot execute require-attention RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_workspace_users_require_attention(uuid, uuid[], uuid)',
    'execute'
  ),
  'authenticated cannot execute require-attention RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_workspace_users_require_attention(uuid, uuid[], uuid)',
    'execute'
  ),
  'service_role can execute require-attention RPC for server-owned callers'
);

select * from finish();

rollback;
