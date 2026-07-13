begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(10);

select ok(
  to_regclass('private.user_group_post_check_logs') is not null,
  'post check audit logs exist in the private schema'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.user_group_post_check_logs'::regclass
  ),
  'post check audit logs keep row-level security enabled'
);

select ok(
  not has_table_privilege(
    'anon',
    'private.user_group_post_check_logs',
    'select'
  ),
  'anon cannot read post check audit logs'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.user_group_post_check_logs',
    'select'
  ),
  'authenticated cannot read post check audit logs directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.user_group_post_check_logs',
    'insert'
  ),
  'authenticated cannot insert post check audit logs directly'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.user_group_post_check_logs',
    'select'
  ),
  'service role can read post check audit logs'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.user_group_post_check_logs',
    'insert'
  ),
  'service role can insert post check audit logs'
);

select ok(
  not has_table_privilege(
    'service_role',
    'private.user_group_post_check_logs',
    'update'
  ),
  'service role cannot rewrite post check audit logs'
);

select ok(
  not has_table_privilege(
    'service_role',
    'private.user_group_post_check_logs',
    'delete'
  ),
  'service role cannot delete post check audit logs'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_group_post_check_logs'
  ),
  'post check audit logs expose no permissive RLS policies'
);

select * from finish();

rollback;
