begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select has_function(
  'private',
  'can_join_task_realtime_topic',
  array['text', 'uuid'],
  'private task realtime channel authorization helper exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'task realtime private channels are scoped'
      and cmd = 'SELECT'
      and roles && array['authenticated'::name]
  ),
  'realtime.messages has scoped authenticated select policy for task channels'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.can_join_task_realtime_topic(text, uuid)',
    'execute'
  ),
  'anon cannot execute task realtime channel authorization helper'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.can_join_task_realtime_topic(text, uuid)',
    'execute'
  ),
  'authenticated role can use task realtime helper during realtime RLS checks'
);

set local session_replication_role = replica;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000a001', 'Realtime Member'),
  ('00000000-0000-4000-8000-00000000a002', 'Realtime Shared User'),
  ('00000000-0000-4000-8000-00000000a003', 'Realtime Shared Email'),
  ('00000000-0000-4000-8000-00000000a004', 'Realtime Stranger'),
  ('00000000-0000-4000-8000-00000000a005', 'Realtime Sharer')
on conflict (id) do nothing;

insert into public.user_private_details (user_id, email)
values
  ('00000000-0000-4000-8000-00000000a003', 'shared@example.com'),
  ('00000000-0000-4000-8000-00000000a004', 'stranger@example.com')
on conflict (user_id) do update
set email = excluded.email;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-00000000b001',
  'Realtime Workspace',
  '00000000-0000-4000-8000-00000000a005',
  false
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a001',
  'MEMBER'
)
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_boards (id, name, ws_id, creator_id)
values (
  '00000000-0000-4000-8000-00000000c001',
  'Realtime Board',
  '00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000a005'
)
on conflict (id) do nothing;

insert into public.task_board_shares (
  board_id,
  shared_with_user_id,
  shared_with_email,
  permission,
  shared_by_user_id
)
values
  (
    '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a002',
    null,
    'view',
    '00000000-0000-4000-8000-00000000a005'
  ),
  (
    '00000000-0000-4000-8000-00000000c001',
    null,
    'shared@example.com',
    'view',
    '00000000-0000-4000-8000-00000000a005'
  )
on conflict do nothing;

insert into realtime.messages (
  id,
  topic,
  extension,
  private,
  event,
  payload
)
values
  (
    '00000000-0000-4000-8000-00000000d001',
    'board-realtime-00000000-0000-4000-8000-00000000c001',
    'broadcast',
    true,
    'probe',
    '{}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-00000000d002',
    'task-user-realtime-00000000-0000-4000-8000-00000000a001',
    'broadcast',
    true,
    'probe',
    '{}'::jsonb
  );

set local session_replication_role = origin;

select ok(
  private.can_join_task_realtime_topic(
    'task-user-realtime-00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a001'
  ),
  'user can join their own task-user realtime channel'
);

select ok(
  not private.can_join_task_realtime_topic(
    'task-user-realtime-00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-00000000a004'
  ),
  'user cannot join another user task-user realtime channel'
);

select ok(
  private.can_join_task_realtime_topic(
    'board-realtime-00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a001'
  ),
  'workspace member can join board realtime channel'
);

select ok(
  private.can_join_task_realtime_topic(
    'board-realtime-00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a002'
  ),
  'direct board share recipient can join board realtime channel'
);

select ok(
  private.can_join_task_realtime_topic(
    'board-realtime-00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a003'
  ),
  'email board share recipient can join board realtime channel'
);

select ok(
  not private.can_join_task_realtime_topic(
    'board-realtime-00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a004'
  ),
  'unshared non-member cannot join board realtime channel'
);

select ok(
  not private.can_join_task_realtime_topic(
    'board-cursor-00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a001'
  ),
  'legacy board cursor channel is not an authorized realtime topic'
);

select ok(
  not private.can_join_task_realtime_topic(
    'task-cursor-00000000-0000-4000-8000-00000000e001',
    '00000000-0000-4000-8000-00000000a001'
  ),
  'legacy task cursor channel is not an authorized realtime topic'
);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000a001',
  true
);
select set_config(
  'realtime.topic',
  'board-realtime-00000000-0000-4000-8000-00000000c001',
  true
);

select is(
  (
    select count(*)::integer
    from realtime.messages
    where id in (
      '00000000-0000-4000-8000-00000000d001',
      '00000000-0000-4000-8000-00000000d002'
    )
  ),
  2,
  'member JWT can pass realtime.messages RLS for authorized board topic'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000a004',
  true
);
select set_config(
  'realtime.topic',
  'board-realtime-00000000-0000-4000-8000-00000000c001',
  true
);

select is(
  (
    select count(*)::integer
    from realtime.messages
    where id in (
      '00000000-0000-4000-8000-00000000d001',
      '00000000-0000-4000-8000-00000000d002'
    )
  ),
  0,
  'unshared non-member JWT cannot pass realtime.messages RLS for board topic'
);

reset role;

select * from finish();

rollback;
