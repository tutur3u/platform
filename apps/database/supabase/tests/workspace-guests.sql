begin;
select plan(18);

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
select ok(
  exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = kcu.constraint_schema
     and ccu.constraint_name = kcu.constraint_name
    where kcu.constraint_schema = 'public'
      and kcu.table_name = 'workspace_guests'
      and kcu.constraint_name = 'workspace_guests_ws_id_fkey'
      and kcu.column_name = 'ws_id'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'workspaces'
      and ccu.column_name = 'id'
  ),
  'workspace_guests_ws_id_fkey should reference public.workspaces(id)'
);
select ok(
  exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = kcu.constraint_schema
     and ccu.constraint_name = kcu.constraint_name
    where kcu.constraint_schema = 'public'
      and kcu.table_name = 'workspace_guests'
      and kcu.constraint_name = 'workspace_guests_user_id_fkey'
      and kcu.column_name = 'user_id'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'users'
      and ccu.column_name = 'id'
  ),
  'workspace_guests_user_id_fkey should reference public.users(id)'
);

-- Check nullability and defaults
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guests'
      and column_name = 'ws_id'
  ),
  'NO',
  'Column ws_id should be NOT NULL'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guests'
      and column_name = 'user_id'
  ),
  'NO',
  'Column user_id should be NOT NULL'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_guests'
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
      and c.relname = 'workspace_guests'
      and a.attname = 'created_at'
      and pg_get_expr(d.adbin, d.adrelid) = 'now()'
  ),
  'Column created_at should default to now()'
);

-- Check unique constraint
select has_unique('public', 'workspace_guests', ARRAY['ws_id', 'user_id'], 'Should have unique constraint on (ws_id, user_id)');

select * from finish();
rollback;
