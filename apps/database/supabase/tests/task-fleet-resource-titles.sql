begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000e6201', 'task-fleet-owner@example.test');

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

with updated as (
  update public.tasks
  set task_resources = jsonb_build_array(
    jsonb_build_object('kind', 'link', 'url', 'https://example.test', 'title', repeat('é', 255) || chr(10))
  )
  where id = '00000000-0000-4000-8000-0000000e6230'
  returning char_length(task_resources->0->>'title') as title_length
)
select is(
  (select title_length from updated), 256,
  'resource titles accept 256 characters including multibyte characters and a newline'
);

select throws_ok($$
  update public.tasks
  set task_resources = jsonb_build_array(
    jsonb_build_object('kind', 'link', 'url', 'https://example.test', 'title', repeat('a', 257))
  )
  where id = '00000000-0000-4000-8000-0000000e6230'
$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_resources_shape"',
  'resource titles reject 257 characters');

select throws_ok($$
  update public.tasks
  set task_resources = '[{"kind":"link","url":"https://example.test","title":""}]'::jsonb
  where id = '00000000-0000-4000-8000-0000000e6230'
$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_resources_shape"',
  'resource titles reject empty strings');

select * from finish();
rollback;
