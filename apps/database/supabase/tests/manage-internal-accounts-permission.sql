begin;

select plan(1);

select ok(
  'manage_internal_accounts' = any(
    enum_range(null::public.workspace_role_permission)::text[]
  ),
  'workspace_role_permission includes manage_internal_accounts'
);

select * from finish();

rollback;
