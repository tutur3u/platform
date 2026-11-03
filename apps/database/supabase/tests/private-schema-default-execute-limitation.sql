begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

-- End-state default EXECUTE ACL of a function created in private by postgres.
-- 20261027151200_restrict_anon_definer_execute.sql sets a global default
-- privilege for role postgres that removes PUBLIC and anon and grants
-- authenticated and service_role, so a new function is closed to anon and PUBLIC
-- but open to authenticated unless it revokes explicitly. The schema-scoped
-- revoke in 20261029030500 adds nothing beyond that global default. The SQL grant
-- guard (scripts/ci/sql-grant-guard.js) still requires an explicit same-file
-- REVOKE for every new SECURITY DEFINER function. Update this test if the
-- global default changes.
create function private.default_execute_limitation_probe()
returns void
language sql
as $$ select $$;

select ok(
  not has_function_privilege(
    'anon',
    'private.default_execute_limitation_probe()',
    'EXECUTE'
  ),
  'a new private function is not executable by anon'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'private.default_execute_limitation_probe()'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'a new private function has no PUBLIC EXECUTE entry'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.default_execute_limitation_probe()',
    'EXECUTE'
  ),
  'a new private function is executable by authenticated through the global default, so a definer there still needs an explicit revoke'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.default_execute_limitation_probe()',
    'EXECUTE'
  ),
  'a new private function is executable by service_role through the global default'
);

select * from finish();
rollback;
