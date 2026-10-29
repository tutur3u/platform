begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

-- Documents a limitation, not a desired state. The schema-scoped default
-- privilege revoke from 20261029030500_align_cross_app_token_grant_and_private_fence.sql
-- (IN SCHEMA private ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC) cannot remove
-- PostgreSQL's global PUBLIC EXECUTE default, so a function created in private
-- afterwards is executable by PUBLIC and anon. The control is the SQL grant
-- guard (scripts/ci/sql-grant-guard.js): every new SECURITY DEFINER function
-- needs an explicit same-file REVOKE ... FROM PUBLIC, anon. A global
-- default-privilege change is a separate tracked decision; update this test
-- when it lands.
create function private.default_execute_limitation_probe()
returns void
language sql
as $$ select $$;

select ok(
  has_function_privilege(
    'anon',
    'private.default_execute_limitation_probe()',
    'EXECUTE'
  ),
  'a new private function is executable by anon through the global PUBLIC default'
);

select ok(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'private.default_execute_limitation_probe()'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'the PUBLIC EXECUTE entry is present, so only an explicit revoke closes it'
);

select * from finish();
rollback;
