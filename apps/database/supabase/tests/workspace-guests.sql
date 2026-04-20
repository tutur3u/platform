begin;
select plan(10);

-- Check table existence
select has_table('public', 'workspace_guests', 'Table workspace_guests should exist');

-- Check columns
select has_column('public', 'workspace_guests', 'id', 'Column id should exist');
select col_type_is('public', 'workspace_guests', 'id', 'uuid', 'Column id should be of type uuid');

select has_column('public', 'workspace_guests', 'created_at', 'Column created_at should exist');
select col_type_is('public', 'workspace_guests', 'created_at', 'timestamp with time zone', 'Column created_at should be of type timestamptz');

select has_column('public', 'workspace_guests', 'ws_id', 'Column ws_id should exist');
select col_type_is('public', 'workspace_guests', 'ws_id', 'uuid', 'Column ws_id should be of type uuid');

select has_column('public', 'workspace_guests', 'user_id', 'Column user_id should exist');
select col_type_is('public', 'workspace_guests', 'user_id', 'uuid', 'Column user_id should be of type uuid');

-- Check foreign keys
select has_fk('public', 'workspace_guests', 'workspace_guests_ws_id_fkey', 'Should have foreign key to workspaces');
select has_fk('public', 'workspace_guests', 'workspace_guests_user_id_fkey', 'Should have foreign key to users');

-- Check unique constraint
select has_unique('public', 'workspace_guests', ARRAY['ws_id', 'user_id'], 'Should have unique constraint on (ws_id, user_id)');

select * from finish();
rollback;
