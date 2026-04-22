begin;
select plan(24);

-- Check table existence
select has_table('public', 'workspace_guest_permissions', 'Table workspace_guest_permissions should exist');

-- Check columns
select has_column('public', 'workspace_guest_permissions', 'id', 'Column id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'id', 'uuid', 'Column id should be of type uuid');

select has_column('public', 'workspace_guest_permissions', 'guest_id', 'Column guest_id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'guest_id', 'uuid', 'Column guest_id should be of type uuid');

select has_column('public', 'workspace_guest_permissions', 'permission', 'Column permission should exist');
select col_type_is('public', 'workspace_guest_permissions', 'permission', 'workspace_guest_permission_t', 'Column permission should use the workspace_guest_permission_t enum');

select has_column('public', 'workspace_guest_permissions', 'enable', 'Column enable should exist');
select col_type_is('public', 'workspace_guest_permissions', 'enable', 'boolean', 'Column enable should be of type boolean');

select has_column('public', 'workspace_guest_permissions', 'created_at', 'Column created_at should exist');
select col_type_is('public', 'workspace_guest_permissions', 'created_at', 'timestamp with time zone', 'Column created_at should be of type timestamptz');

select has_column('public', 'workspace_guest_permissions', 'resource_id', 'Column resource_id should exist');
select col_type_is('public', 'workspace_guest_permissions', 'resource_id', 'uuid', 'Column resource_id should be of type uuid');

-- Check foreign key
select has_fk('public', 'workspace_guest_permissions', 'workspace_guest_permissions_guest_id_fkey', 'Should have foreign key to workspace_guests');
select has_fk('public', 'workspace_guest_permissions', 'workspace_guest_permissions_resource_id_fkey', 'Should have foreign key to workspace_user_groups');
select ok(
  exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = kcu.constraint_schema
     and ccu.constraint_name = kcu.constraint_name
    where kcu.constraint_schema = 'public'
      and kcu.table_name = 'workspace_guest_permissions'
      and kcu.constraint_name = 'workspace_guest_permissions_guest_id_fkey'
      and kcu.column_name = 'guest_id'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'workspace_guests'
      and ccu.column_name = 'id'
  ),
  'workspace_guest_permissions_guest_id_fkey should reference public.workspace_guests(id)'
);
select ok(
  exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = kcu.constraint_schema
     and ccu.constraint_name = kcu.constraint_name
    where kcu.constraint_schema = 'public'
      and kcu.table_name = 'workspace_guest_permissions'
      and kcu.constraint_name = 'workspace_guest_permissions_resource_id_fkey'
      and kcu.column_name = 'resource_id'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'workspace_user_groups'
      and ccu.column_name = 'id'
  ),
  'workspace_guest_permissions_resource_id_fkey should reference public.workspace_user_groups(id)'
);

-- Check nullability and defaults
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guest_permissions'
      and column_name = 'guest_id'
  ),
  'NO',
  'Column guest_id should be NOT NULL'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guest_permissions'
      and column_name = 'enable'
  ),
  'NO',
  'Column enable should be NOT NULL'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guest_permissions'
      and column_name = 'created_at'
  ),
  'NO',
  'Column created_at should be NOT NULL'
);
select ok(
  exists (
    select 1
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
    where n.nspname = 'public'
      and c.relname = 'workspace_guest_permissions'
      and a.attname = 'enable'
      and pg_get_expr(d.adbin, d.adrelid) = 'true'
  ),
  'Column enable should default to true'
);
select ok(
  exists (
    select 1
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
    where n.nspname = 'public'
      and c.relname = 'workspace_guest_permissions'
      and a.attname = 'created_at'
      and pg_get_expr(d.adbin, d.adrelid) = 'now()'
  ),
  'Column created_at should default to now()'
);

-- Check uniqueness constraints for global and resource-scoped permissions
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'workspace_guest_permissions'
      and indexname = 'ux_workspace_guest_perm_global'
  ),
  'Should have a unique index for global guest permissions'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'workspace_guest_permissions'
      and indexname = 'ux_workspace_guest_perm_resource'
  ),
  'Should have a unique index for resource-scoped guest permissions'
);

select * from finish();
rollback;
