begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;
set local role service_role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000000A',
    'role', 'service_role'
  )::text,
  true
);

select plan(17);

insert into public.users (id, email)
select '00000000-0000-0000-0000-00000000000A', 'local@example.com'
where not exists (
  select 1
  from public.users
  where id = '00000000-0000-0000-0000-00000000000A'
);

insert into public.workspaces (name, personal, creator_id)
select 'PERSONAL', true, '00000000-0000-0000-0000-00000000000A'
where not exists (
  select 1
  from public.workspaces
  where creator_id = '00000000-0000-0000-0000-00000000000A'
    and personal is true
    and deleted is false
);

update public.workspaces
set created_at = now() - interval '2 hours'
where creator_id = '00000000-0000-0000-0000-00000000000A'
  and personal is true
  and deleted is false;

create temporary table pgtap_entity_limit_context (
  ws_id uuid,
  board_id uuid,
  list_id uuid
);

with base_ws as (
  insert into public.workspaces (name, personal, creator_id, created_at)
  values (
    'Limit Base Workspace',
    false,
    '00000000-0000-0000-0000-00000000000A',
    now() - interval '2 hours'
  )
  returning id
),
base_board as (
  insert into public.workspace_boards (name, ws_id, creator_id)
  select 'Limit Base Board', base_ws.id, '00000000-0000-0000-0000-00000000000A'
  from base_ws
  returning id
),
base_list as (
  insert into public.task_lists (name, board_id, creator_id)
  select 'Limit Base List', base_board.id, '00000000-0000-0000-0000-00000000000A'
  from base_board
  returning id
)
insert into pgtap_entity_limit_context (ws_id, board_id, list_id)
select base_ws.id, base_board.id, base_list.id
from base_ws, base_board, base_list;

delete from public.platform_entity_creation_limits
where table_name in ('workspaces', 'workspace_whiteboards', 'tasks');

select ok(
  (select count(*)
   from public.get_available_platform_entity_limit_tables()
   where table_name in ('workspaces', 'workspace_whiteboards', 'tasks')) = 3,
  'available limit tables include workspaces, workspace_whiteboards, and tasks'
);

select lives_ok(
  $$select public.add_platform_entity_creation_limit_table('workspaces', 'limit tests', '00000000-0000-0000-0000-00000000000A')$$,
  'adds workspaces to platform entity limits'
);

select lives_ok(
  $$select public.add_platform_entity_creation_limit_table('workspace_whiteboards', 'limit tests', '00000000-0000-0000-0000-00000000000A')$$,
  'adds workspace_whiteboards to platform entity limits'
);

select lives_ok(
  $$select public.add_platform_entity_creation_limit_table('tasks', 'limit tests', '00000000-0000-0000-0000-00000000000A')$$,
  'adds tasks to platform entity limits'
);

select is(
  (select count(*)
   from public.platform_entity_creation_limits
   where table_name in ('workspaces', 'workspace_whiteboards', 'tasks')),
  12,
  'creates four tier rows per limit table'
);

select is(
  (select count(*)
   from public.update_platform_entity_creation_limit_metadata(
     'workspaces',
     'limit tests: metadata update',
     '00000000-0000-0000-0000-00000000000A'
   )),
  4,
  'updates limit metadata across all tiers'
);

select is(
  (public.update_platform_entity_creation_limit_tier(
    'workspaces',
    'FREE',
    true,
    5,
    null,
    null,
    null,
    null,
    '00000000-0000-0000-0000-00000000000A'
  )).per_hour,
  5,
  'sets FREE workspace per-hour limit to 5'
);

select is(
  (public.update_platform_entity_creation_limit_tier(
    'workspace_whiteboards',
    'FREE',
    true,
    5,
    null,
    null,
    null,
    null,
    '00000000-0000-0000-0000-00000000000A'
  )).per_hour,
  5,
  'sets FREE whiteboard per-hour limit to 5'
);

select is(
  (public.update_platform_entity_creation_limit_tier(
    'tasks',
    'FREE',
    true,
    5,
    null,
    null,
    null,
    null,
    '00000000-0000-0000-0000-00000000000A'
  )).per_hour,
  5,
  'sets FREE task per-hour limit to 5'
);

select lives_ok(
  $$select public.reattach_platform_entity_creation_limit_trigger('tasks')$$,
  'reattaches entity limit trigger for tasks'
);

select ok(
  exists (
    select 1
    from pg_trigger trg
    where trg.tgrelid = 'public.tasks'::regclass
      and trg.tgname = 'enforce_platform_entity_creation_limits'
      and not trg.tgisinternal
  ),
  'tasks limit trigger is attached'
);

select lives_ok(
  $$do $body$
  declare
    idx integer;
  begin
    for idx in 1..5 loop
      insert into public.workspaces (name, personal, creator_id)
      values (
        format('Limit Workspace %s', idx),
        false,
        '00000000-0000-0000-0000-00000000000A'
      );
    end loop;
  end;
  $body$;$$,
  'creates five workspaces within the hourly limit'
);

select throws_ok(
  $$insert into public.workspaces (name, personal, creator_id)
    values ('Limit Workspace 6', false, '00000000-0000-0000-0000-00000000000A')$$,
  'P0001',
  'ENTITY_HOURLY_LIMIT_EXCEEDED',
  'blocks the sixth workspace created within the hour'
);

select lives_ok(
  $$do $body$
  declare
    idx integer;
    v_ws_id uuid;
  begin
    select ws_id into v_ws_id from pgtap_entity_limit_context limit 1;
    for idx in 1..5 loop
      insert into public.workspace_whiteboards (title, ws_id, creator_id)
      values (
        format('Limit Whiteboard %s', idx),
        v_ws_id,
        '00000000-0000-0000-0000-00000000000A'
      );
    end loop;
  end;
  $body$;$$,
  'creates five whiteboards within the hourly limit'
);

select throws_ok(
  $$insert into public.workspace_whiteboards (title, ws_id, creator_id)
    values (
      'Limit Whiteboard 6',
      (select ws_id from pgtap_entity_limit_context limit 1),
      '00000000-0000-0000-0000-00000000000A'
    )$$,
  'P0001',
  'ENTITY_HOURLY_LIMIT_EXCEEDED',
  'blocks the sixth whiteboard created within the hour'
);

select lives_ok(
  $$do $body$
  declare
    idx integer;
    v_list_id uuid;
  begin
    select list_id into v_list_id from pgtap_entity_limit_context limit 1;
    for idx in 1..5 loop
      insert into public.tasks (name, list_id, creator_id)
      values (
        format('Limit Task %s', idx),
        v_list_id,
        '00000000-0000-0000-0000-00000000000A'
      );
    end loop;
  end;
  $body$;$$,
  'creates five tasks within the hourly limit'
);

select throws_ok(
  $$insert into public.tasks (name, list_id, creator_id)
    values (
      'Limit Task 6',
      (select list_id from pgtap_entity_limit_context limit 1),
      '00000000-0000-0000-0000-00000000000A'
    )$$,
  'P0001',
  'ENTITY_HOURLY_LIMIT_EXCEEDED',
  'blocks the sixth task created within the hour'
);

select * from finish();

rollback;
