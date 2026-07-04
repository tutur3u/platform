begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

select ok(
  exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'create_task_list_with_next_position'
      and pronargs = 5
  ),
  'task list creation RPC accepts an explicit creator actor'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'create_task_list_with_next_position'
      and pronargs = 4
  ),
  'legacy task list creation RPC overload was removed'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-00000000f101',
    'authenticated',
    'authenticated',
    'task-list-creator@example.com',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000f102',
    'authenticated',
    'authenticated',
    'task-list-forger@example.com',
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000f101', 'Task List Creator'),
  ('00000000-0000-4000-8000-00000000f102', 'Task List Forger')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-00000000f201',
  'Task List Creator Attribution',
  '00000000-0000-4000-8000-00000000f101',
  false
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-00000000f101',
  'MEMBER'
)
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_boards (id, name, ws_id, creator_id)
values (
  '00000000-0000-4000-8000-00000000f301',
  'Creator Attribution Board',
  '00000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-00000000f101'
)
on conflict (id) do nothing;

set local role service_role;

select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select * from public.create_task_list_with_next_position(
    '00000000-0000-4000-8000-00000000f301',
    'Missing Creator',
    'not_started'::public.task_board_status,
    'GRAY'
  )$$,
  'P0001',
  'Creator ID is required',
  'service-role caller must provide the verified actor'
);

select is(
  (
    select count(*)::integer
    from public.task_lists
    where board_id = '00000000-0000-4000-8000-00000000f301'
      and name = 'Missing Creator'
  ),
  0,
  'missing service-role actor does not insert a task list'
);

select lives_ok(
  $$select * from public.create_task_list_with_next_position(
    '00000000-0000-4000-8000-00000000f301',
    'Service Role Created',
    'not_started'::public.task_board_status,
    'GRAY',
    '00000000-0000-4000-8000-00000000f101'
  )$$,
  'service-role caller can stamp the verified actor'
);

select is(
  (
    select creator_id
    from public.task_lists
    where board_id = '00000000-0000-4000-8000-00000000f301'
      and name = 'Service Role Created'
    order by created_at desc
    limit 1
  ),
  '00000000-0000-4000-8000-00000000f101'::uuid,
  'service-role task list keeps the route actor as creator'
);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000f101',
  true
);

select throws_ok(
  $$select * from public.create_task_list_with_next_position(
    '00000000-0000-4000-8000-00000000f301',
    'Forged Creator',
    'review'::public.task_board_status,
    'RED',
    '00000000-0000-4000-8000-00000000f102'
  )$$,
  'P0001',
  'Creator ID does not match authenticated user',
  'authenticated caller cannot forge another creator'
);

select is(
  (
    select count(*)::integer
    from public.task_lists
    where board_id = '00000000-0000-4000-8000-00000000f301'
      and name = 'Forged Creator'
  ),
  0,
  'creator forgery does not insert a task list'
);

reset role;

select * from finish();

rollback;
