begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select is(
  (
    select tgfoid::regprocedure::text
    from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'enforce_strict_text_field_limits()',
  'tasks writes run the generic strict text and payload trigger'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'needs_user_reason_strict_length_check'
      and convalidated
  ),
  format(
    'CHECK ((char_length(needs_user_reason) <= %s))',
    strict_text_field_char_limit('tasks', 'needs_user_reason')
  ),
  'needs_user_reason has a validated strict length check at the trigger limit'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'needs_user_reason_strict_bytes_check'
      and convalidated
  ),
  format(
    'CHECK ((octet_length(needs_user_reason) <= %s))',
    strict_text_field_byte_limit('tasks', 'needs_user_reason')
  ),
  'needs_user_reason has a validated strict byte check at the trigger limit'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'virtual_assignees_strict_payload_size_check'
      and convalidated
  ),
  format(
    'CHECK ((octet_length((virtual_assignees)::text) <= %s))',
    strict_payload_field_byte_limit('tasks', 'virtual_assignees')
  ),
  'virtual_assignees has a validated strict payload check at the trigger limit'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'task_resources_strict_payload_size_check'
      and convalidated
  ),
  format(
    'CHECK ((octet_length((task_resources)::text) <= %s))',
    strict_payload_field_byte_limit('tasks', 'task_resources')
  ),
  'task_resources has a validated strict payload check at the trigger limit'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname in (
        'tasks_virtual_assignees_shape',
        'tasks_needs_user_reason_length',
        'tasks_resources_shape'
      )
  ),
  3,
  'the fleet shape and non-empty checks remain in place'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000e6301', 'task-fleet-strict@example.test');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-0000000e6310', 'Fleet Strict Fields',
  '00000000-0000-4000-8000-0000000e6301', false
);

insert into public.workspace_boards (id, ws_id, name, creator_id)
values (
  '00000000-0000-4000-8000-0000000e6320', '00000000-0000-4000-8000-0000000e6310',
  'Fleet Strict Board', '00000000-0000-4000-8000-0000000e6301'
);

insert into public.tasks (id, name, list_id, creator_id)
select '00000000-0000-4000-8000-0000000e6330', 'Fleet Strict Task', id,
       '00000000-0000-4000-8000-0000000e6301'
from public.task_lists
where board_id = '00000000-0000-4000-8000-0000000e6320' and status = 'active'
limit 1;

select lives_ok($$
  update public.tasks
  set needs_user_reason = repeat('é', 512)
  where id = '00000000-0000-4000-8000-0000000e6330'
$$, 'needs_user_reason accepts 512 multibyte characters');

select throws_ok($$
  update public.tasks
  set needs_user_reason = repeat('a', 513)
  where id = '00000000-0000-4000-8000-0000000e6330'
$$, '22001', null, 'needs_user_reason rejects 513 characters');

select * from finish();
rollback;
