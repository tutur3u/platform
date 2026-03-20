begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;
set local role service_role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000b1',
    'role', 'service_role'
  )::text,
  true
);

select plan(3);

insert into public.users (id, email)
values ('00000000-0000-0000-0000-0000000000b1', 'task-yjs-rpc@example.com')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b2',
  'Task Yjs RPC Workspace',
  false,
  '00000000-0000-0000-0000-0000000000b1'
)
on conflict (id) do nothing;

insert into public.workspace_boards (id, name, ws_id, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b3',
  'Task Yjs RPC Board',
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000b1'
)
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b4',
  'Task Yjs RPC List',
  '00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000b1'
)
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, creator_id, description_yjs_state)
values (
  '00000000-0000-0000-0000-0000000000b5',
  'Task Yjs RPC Seed',
  '00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000b1',
  array[1, 2, 3]::smallint[]
)
on conflict (id) do update
set
  name = excluded.name,
  list_id = excluded.list_id,
  creator_id = excluded.creator_id,
  description_yjs_state = excluded.description_yjs_state;

select is(
  (
    select updated.description_yjs_state::text
    from public.update_task_with_relations(
      p_task_id := '00000000-0000-0000-0000-0000000000b5',
      p_task_updates := jsonb_build_object(
        'description_yjs_state',
        jsonb_build_array(9, 8, 7)
      )
    ) updated
    limit 1
  ),
  '{9,8,7}',
  'update_task_with_relations persists description_yjs_state arrays exactly'
);

select is(
  (
    select updated.description_yjs_state is null
    from public.update_task_with_relations(
      p_task_id := '00000000-0000-0000-0000-0000000000b5',
      p_task_updates := jsonb_build_object(
        'description_yjs_state',
        null
      )
    ) updated
    limit 1
  ),
  true,
  'update_task_with_relations clears description_yjs_state when payload is explicit null'
);

with seeded as (
  select *
  from public.update_task_with_relations(
    p_task_id := '00000000-0000-0000-0000-0000000000b5',
    p_task_updates := jsonb_build_object(
      'description_yjs_state',
      jsonb_build_array(4, 4)
    )
  )
),
renamed as (
  select updated.*
  from seeded
  join lateral public.update_task_with_relations(
    p_task_id := '00000000-0000-0000-0000-0000000000b5',
    p_task_updates := jsonb_build_object('name', 'Task Yjs RPC Renamed')
  ) updated on true
)
select ok(
  (
    select renamed.name = 'Task Yjs RPC Renamed'
      and renamed.description_yjs_state::text = '{4,4}'
    from renamed
    limit 1
  ),
  'non-description updates keep description_yjs_state unchanged'
);

select * from finish();

rollback;
