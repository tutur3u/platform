begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(27);

select has_table('public', 'task_board_shares', 'task board share table exists');
select has_column('public', 'task_board_shares', 'board_id', 'share stores board id');
select has_column('public', 'task_board_shares', 'shared_with_user_id', 'share can target a user');
select has_column('public', 'task_board_shares', 'shared_with_email', 'share can target an email');
select has_column('public', 'task_board_shares', 'permission', 'share stores permission');
select has_column('public', 'task_board_shares', 'shared_by_user_id', 'share stores inviter');

select col_is_fk('public', 'task_board_shares', 'board_id', 'board id is a foreign key');
select col_is_fk('public', 'task_board_shares', 'shared_with_user_id', 'recipient user is a foreign key');
select col_is_fk('public', 'task_board_shares', 'shared_by_user_id', 'sharer user is a foreign key');

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'task_board_shares_has_recipient'
      and conrelid = 'public.task_board_shares'::regclass
      and contype = 'c'
  ),
  'share requires a recipient'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'task_board_shares_email_is_normalized'
      and conrelid = 'public.task_board_shares'::regclass
      and contype = 'c'
  ),
  'share email is normalized'
);
select has_index('public', 'task_board_shares', 'task_board_shares_email_unique_idx', 'email recipient is unique per board');

select has_function('public', 'get_task_board_workspace_id', array['uuid'], 'board workspace helper exists');
select has_function('public', 'is_task_board_workspace_member', array['uuid'], 'board membership helper exists');

select ok(
  not has_table_privilege('authenticated', 'public.task_board_shares', 'select'),
  'authenticated cannot select task board shares directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.task_board_shares', 'insert'),
  'authenticated cannot insert task board shares directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.task_board_shares', 'update'),
  'authenticated cannot update task board shares directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.task_board_shares', 'delete'),
  'authenticated cannot delete task board shares directly'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_board_shares'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'task board shares have no direct authenticated RLS policies'
);

select ok(
  has_table_privilege('service_role', 'public.task_board_shares', 'select'),
  'service role can select task board shares'
);

select ok(
  has_table_privilege('service_role', 'public.task_board_shares', 'insert'),
  'service role can insert task board shares'
);

select ok(
  has_table_privilege('service_role', 'public.task_board_shares', 'update'),
  'service role can update task board shares'
);

select ok(
  has_table_privilege('service_role', 'public.task_board_shares', 'delete'),
  'service role can delete task board shares'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_task_board_workspace_id(uuid)',
    'execute'
  ),
  'authenticated cannot execute task board workspace helper directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_task_board_workspace_id(uuid)',
    'execute'
  ),
  'service role can execute task board workspace helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.is_task_board_workspace_member(uuid)',
    'execute'
  ),
  'authenticated cannot execute task board membership helper directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.is_task_board_workspace_member(uuid)',
    'execute'
  ),
  'service role can execute task board membership helper'
);

select * from finish();

rollback;
