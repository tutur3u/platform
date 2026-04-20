begin;
select plan(14);

-- Check table existence
select has_table('public', 'workspace_guest_permissions', 'Table workspace_guest_permissions should exist');

-- Check columns
select has_column('public', 'workspace_guest_permissions', 'id', 'Column id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'id', 'uuid', 'Column id should be of type uuid');

select has_column('public', 'workspace_guest_permissions', 'guest_id', 'Column guest_id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'guest_id', 'uuid', 'Column guest_id should be of type uuid');

select has_column('public', 'workspace_guest_permissions', 'permission', 'Column permission should exist');
select col_type_is('public', 'workspace_guest_permissions', 'permission', 'text', 'Column permission should be of type text');

select has_column('public', 'workspace_guest_permissions', 'enable', 'Column enable should exist');
select col_type_is('public', 'workspace_guest_permissions', 'enable', 'boolean', 'Column enable should be of type boolean');

select has_column('public', 'workspace_guest_permissions', 'created_at', 'Column created_at should exist');
select col_type_is('public', 'workspace_guest_permissions', 'created_at', 'timestamp with time zone', 'Column created_at should be of type timestamptz');

select has_column('public', 'workspace_guest_permissions', 'resource_id', 'Column resource_id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'resource_id', 'uuid', 'Column resource_id should be of type uuid');

-- Check foreign key
select has_fk('public', 'workspace_guest_permissions', 'workspace_guest_permissions_guest_id_fkey', 'Should have foreign key to workspace_guests');

select * from finish();
rollback;
