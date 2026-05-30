begin;

select plan(14);

select has_table('public', 'task_board_shares', 'task board share table exists');
select has_column('public', 'task_board_shares', 'board_id', 'share stores board id');
select has_column('public', 'task_board_shares', 'shared_with_user_id', 'share can target a user');
select has_column('public', 'task_board_shares', 'shared_with_email', 'share can target an email');
select has_column('public', 'task_board_shares', 'permission', 'share stores permission');
select has_column('public', 'task_board_shares', 'shared_by_user_id', 'share stores inviter');

select col_is_fk('public', 'task_board_shares', 'board_id', 'board id is a foreign key');
select col_is_fk('public', 'task_board_shares', 'shared_with_user_id', 'recipient user is a foreign key');
select col_is_fk('public', 'task_board_shares', 'shared_by_user_id', 'sharer user is a foreign key');

select has_check('public', 'task_board_shares', 'task_board_shares_has_recipient', 'share requires a recipient');
select has_check('public', 'task_board_shares', 'task_board_shares_email_is_normalized', 'share email is normalized');
select has_index('public', 'task_board_shares', 'task_board_shares_email_unique_idx', 'email recipient is unique per board');

select has_function('public', 'get_task_board_workspace_id', array['uuid'], 'board workspace helper exists');
select has_function('public', 'is_task_board_workspace_member', array['uuid'], 'board membership helper exists');

select * from finish();

rollback;
