begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(7);

select ok(
  to_regprocedure('private.mind_get_board_graph_snapshot(uuid,uuid)') is not null,
  'Mind graph-only snapshot RPC exists'
);

select ok(
  to_regprocedure('private.mind_list_ai_patches(uuid,uuid,integer)') is not null,
  'Mind patch-list RPC exists'
);

select ok(
  pg_get_functiondef('private.mind_get_board_snapshot(uuid,uuid)'::regprocedure)
    like '%mind_get_board_graph_snapshot%',
  'Mind full snapshot composes the graph-only snapshot'
);

select ok(
  pg_get_functiondef('private.mind_get_board_snapshot(uuid,uuid)'::regprocedure)
    like '%mind_list_ai_patches%',
  'Mind full snapshot composes the patch-list snapshot'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.mind_get_board_graph_snapshot(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.mind_get_board_graph_snapshot(uuid,uuid)',
    'execute'
  ),
  'client roles cannot execute Mind graph-only snapshot RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.mind_list_ai_patches(uuid,uuid,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.mind_list_ai_patches(uuid,uuid,integer)',
    'execute'
  ),
  'client roles cannot execute Mind patch-list RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.mind_get_board_graph_snapshot(uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.mind_list_ai_patches(uuid,uuid,integer)',
    'execute'
  ),
  'service role can execute split Mind snapshot RPCs'
);

select * from finish();

rollback;
