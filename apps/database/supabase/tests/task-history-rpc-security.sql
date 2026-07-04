begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

select has_function(
  'public',
  'insert_task_history',
  array['uuid', 'text', 'text', 'jsonb', 'jsonb', 'jsonb'],
  'legacy task history insert RPC exists'
);

select has_function(
  'public',
  'insert_task_history',
  array['uuid', 'text', 'text', 'jsonb', 'jsonb', 'jsonb', 'uuid'],
  'actor-aware task history insert RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb)',
    'execute'
  ),
  'anon cannot execute legacy task history insert RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb)',
    'execute'
  ),
  'authenticated cannot execute legacy task history insert RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb)',
    'execute'
  ),
  'service_role can execute legacy task history insert RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb, uuid)',
    'execute'
  ),
  'anon cannot execute actor-aware task history insert RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb, uuid)',
    'execute'
  ),
  'authenticated cannot execute actor-aware task history insert RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.insert_task_history(uuid, text, text, jsonb, jsonb, jsonb, uuid)',
    'execute'
  ),
  'service_role can execute actor-aware task history insert RPC'
);

select * from finish();

rollback;
