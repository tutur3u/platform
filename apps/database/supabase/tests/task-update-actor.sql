begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000e6201', 'task-fleet-owner@example.test'),
  ('00000000-0000-4000-8000-0000000e6202', 'task-fleet-actor@example.test');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-0000000e6210', 'Fleet Fields',
  '00000000-0000-4000-8000-0000000e6201', false
);

insert into public.workspace_boards (id, ws_id, name, creator_id)
values (
  '00000000-0000-4000-8000-0000000e6220', '00000000-0000-4000-8000-0000000e6210',
  'Fleet Board', '00000000-0000-4000-8000-0000000e6201'
);

insert into public.tasks (id, name, list_id, creator_id)
select '00000000-0000-4000-8000-0000000e6230', 'Fleet Task', id,
       '00000000-0000-4000-8000-0000000e6201'
from public.task_lists
where board_id = '00000000-0000-4000-8000-0000000e6220' and status = 'active'
limit 1;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000e6201"}';

select throws_ok($$
  select public.update_task_with_relations(
    '00000000-0000-4000-8000-0000000e6230', '{"name":"Forged wrapper update"}',
    p_actor_user_id := '00000000-0000-4000-8000-0000000e6202'
  )
$$, '42501', 'TASK_UPDATE_ACTOR_MISMATCH', 'task RPC rejects an authenticated actor mismatch');

select throws_ok($$
  select public.update_task_with_relations_legacy_20260321(
    '00000000-0000-4000-8000-0000000e6230', '{"name":"Forged legacy update"}',
    p_actor_user_id := '00000000-0000-4000-8000-0000000e6202'
  )
$$, '42501', 'TASK_UPDATE_ACTOR_MISMATCH', 'legacy task RPC rejects the same actor mismatch');

select throws_ok($$
  select public.update_task_with_relations(
    '00000000-0000-4000-8000-0000000e6230', '{"name":"Authenticated update"}',
    p_actor_user_id := '00000000-0000-4000-8000-0000000e6201'
  )
$$, '42501', 'permission denied for table tasks', 'a matching actor does not grant table access');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select is(
  (select name from public.update_task_with_relations(
    '00000000-0000-4000-8000-0000000e6230', '{"name":"Service role update"}',
    p_actor_user_id := '00000000-0000-4000-8000-0000000e6202'
  )),
  'Service role update',
  'a service-role call without a JWT subject can provide an explicit actor'
);

select is(
  (select changed_by from public.task_history
   where task_id = '00000000-0000-4000-8000-0000000e6230'
     and field_name = 'name' and new_value = '"Service role update"'::jsonb),
  '00000000-0000-4000-8000-0000000e6202'::uuid,
  'service-role task history records the explicit actor'
);

select * from finish();
rollback;
