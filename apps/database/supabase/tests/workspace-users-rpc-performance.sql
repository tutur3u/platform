begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(6);

select has_function(
  'public',
  'get_workspace_users',
  array['uuid', 'uuid[]', 'uuid[]', 'text', 'boolean', 'text', 'text'],
  'workspace-user listing RPC exists'
);

select function_lang_is(
  'public',
  'get_workspace_users',
  array['uuid', 'uuid[]', 'uuid[]', 'text', 'boolean', 'text', 'text'],
  'sql',
  'workspace-user listing RPC is inlineable SQL'
);

select volatility_is(
  'public',
  'get_workspace_users',
  array['uuid', 'uuid[]', 'uuid[]', 'text', 'boolean', 'text', 'text'],
  'stable',
  'workspace-user listing RPC is stable'
);

select ok(
  position(
    'workspace_users_with_groups' in pg_get_functiondef(
      'public.get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text)'::regprocedure
    )
  ) = 0,
  'workspace-user listing avoids the aggregate-first compatibility view'
);

select ok(
  position(
    'not exists' in lower(pg_get_functiondef(
      'public.get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text)'::regprocedure
    ))
  ) > 0,
  'workspace-user listing filters virtual users with an anti-join'
);

select has_index(
  'public',
  'workspace_user_linked_users',
  'workspace_user_linked_users_ws_virtual_user_id_idx',
  'virtual-user anti-join has a workspace-scoped covering index'
);

select * from finish();

rollback;
