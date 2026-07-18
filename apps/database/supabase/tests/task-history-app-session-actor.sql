begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(4);

select ok(
  to_regprocedure(
    'public.get_task_history_for_actor(uuid,uuid,uuid,integer,integer,text,text)'
  ) is not null,
  'app-session task history actor wrapper exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_task_history_for_actor(uuid,uuid,uuid,integer,integer,text,text)',
    'execute'
  ),
  'service role can execute the app-session task history actor wrapper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_task_history_for_actor(uuid,uuid,uuid,integer,integer,text,text)',
    'execute'
  ),
  'authenticated clients cannot execute the app-session task history actor wrapper'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_task_history_for_actor(uuid,uuid,uuid,integer,integer,text,text)',
    'execute'
  ),
  'anonymous clients cannot execute the app-session task history actor wrapper'
);

select * from finish();

rollback;
