-- Run against a disposable LOCAL stack replayed through 20261122030000.
-- Run with psql -v ON_ERROR_STOP=1 -f and check all TAP results.
-- The enclosing transaction leaves the baseline schema in place.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

create temporary view membership_tables as
select oid, relname, relowner, relacl
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'workspace_members', 'workspace_role_members', 'workspace_role_permissions',
    'workspace_roles', 'workspace_default_permissions',
    'workspace_invites', 'workspace_email_invites'
  );

create temporary view membership_policies as
select *
from pg_policies
where schemaname = 'public' and tablename in (select relname from membership_tables);

create temporary view membership_grants as
select relname, grantor, grantee, privilege_type, is_grantable
from membership_tables
cross join lateral aclexplode(coalesce(relacl, acldefault('r', relowner)));

create temporary view membership_effective_grants as
select relname, actor, operation,
  has_table_privilege(actor, oid, operation) as allowed,
  case when operation in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
    then has_any_column_privilege(actor, oid, operation)
  end as any_column_allowed
from membership_tables
cross join (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) roles(actor)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
  ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) operations(operation);

create temporary table membership_policies_before as table membership_policies;
create temporary table membership_grants_before as table membership_grants;
create temporary table membership_effective_grants_before as table membership_effective_grants;

\ir ../supabase/migrations/20261122033000_revoke_client_workspace_membership_writes.sql

select results_eq(
  $$select tablename, permissive, roles, qual from membership_policies
    where cmd = 'SELECT' and policyname like 'Allow role managers to read %' order by tablename$$,
  $$select tablename, permissive, roles, qual from membership_policies_before
    where cmd = 'ALL' and policyname like 'Allow role managers to manage %' order by tablename$$,
  'the four SELECT policies preserve the original USING expressions'
);

\ir ../rollbacks/20261122033000_revoke_client_workspace_membership_writes.rollback.sql

select results_eq(
  'select * from membership_policies order by tablename, policyname',
  'select * from membership_policies_before order by tablename, policyname',
  'rollback restores every pg_policies row on the seven tables'
);
create temporary view membership_grant_changes as
select 'removed'::text as change, removed.*
from (table membership_grants_before except table membership_grants) removed
union all
select 'added'::text, added.*
from (table membership_grants except table membership_grants_before) added;

select results_eq(
  $$select * from membership_grant_changes order by change, relname, grantor, grantee, privilege_type, is_grantable$$,
  $$select 'removed'::text, relname, 'postgres'::regrole::oid, actor::regrole::oid, operation, false
    from membership_tables
    cross join (values
      ('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'),
      ('anon', 'TRUNCATE'), ('anon', 'TRIGGER'), ('anon', 'REFERENCES'),
      ('authenticated', 'TRUNCATE'), ('authenticated', 'TRIGGER'), ('authenticated', 'REFERENCES')
    ) expected(actor, operation)
    order by 1, 2, 3, 4, 5, 6$$,
  'rollback keeps exactly the listed anonymous and non-row ACL entries revoked'
);

select results_eq(
  $$select * from membership_effective_grants
    where actor = 'authenticated' and operation in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    order by relname, operation$$,
  $$select * from membership_effective_grants_before
    where actor = 'authenticated' and operation in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    order by relname, operation$$,
  'rollback restores effective signed-in row privileges on the seven tables'
);

select results_eq(
  $$select * from membership_effective_grants
    where actor in ('service_role', 'postgres') order by relname, actor, operation$$,
  $$select * from membership_effective_grants_before
    where actor in ('service_role', 'postgres') order by relname, actor, operation$$,
  'rollback preserves every service-role and owner privilege on the seven tables'
);

-- A grant from another role can survive a revoke issued by the table owner.
savepoint surviving_client_grant;
grant truncate on table public.workspace_invites to service_role with grant option;
set local role service_role;
grant truncate on table public.workspace_invites to anon;
reset role;

select ok(exists (
  select 1 from membership_grants
  where relname = 'workspace_invites'
    and grantor = 'service_role'::regrole and grantee = 'anon'::regrole
    and privilege_type = 'TRUNCATE'
), 'the alternate grantor gives anon TRUNCATE on workspace_invites');

\set ON_ERROR_STOP off
\ir ../supabase/migrations/20261122033000_revoke_client_workspace_membership_writes.sql
\set boundary_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
rollback to surviving_client_grant;

select is(:'boundary_sqlstate'::text, '42501'::text,
  'the migration aborts when an alternate grantor leaves anon with TRUNCATE');

select * from finish();
rollback;
