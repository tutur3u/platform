begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(
  not has_schema_privilege(role_name, 'private', 'USAGE'),
  format('%s cannot use schema private', role_name)
)
from (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name);

-- SR-924: only the policy, CHECK and pre-request dependents keep client-role EXECUTE.
with expected(signature, role_name, privilege_name) as (
values
  ('private.can_join_form_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.can_join_task_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.valid_subscription_months(date[])', 'authenticated', 'EXECUTE'),
  ('private.get_rate_limit_trust_decision(uuid,inet,uuid)', 'authenticator', 'EXECUTE')
),
actual as (
  select p.oid::regprocedure::text as signature,
         roles.role_name,
         'EXECUTE'::text as privilege_name
  from pg_proc p
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  where p.pronamespace = 'private'::regnamespace
    and has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
)
select ok(
  not exists (
    select signature, role_name, privilege_name from actual
    except
    select signature, role_name, privilege_name from expected
  ),
  'private function EXECUTE grants are a subset of the SR-924 keep-list'
);

-- SR-331: unreachable without schema USAGE; shrink this list as privileges are revoked.
with expected(object_name, role_name, privilege_name) as (
values
  ('private.inventory_audit_logs_id_seq', 'anon', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'USAGE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'USAGE')
),
actual as (
  select c.oid::regclass::text as object_name,
         roles.role_name,
         privileges.privilege_name
  from pg_class c
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  cross join (values
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
  ) as privileges(privilege_name)
  where c.relnamespace = 'private'::regnamespace
    and c.relkind in ('r', 'v', 'm', 'p')
    and has_table_privilege(roles.role_name, c.oid, privileges.privilege_name)
  union all
  select c.oid::regclass::text as object_name,
         roles.role_name,
         privileges.privilege_name
  from pg_class c
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as privileges(privilege_name)
  where c.relnamespace = 'private'::regnamespace
    and c.relkind = 'S'
    and has_sequence_privilege(roles.role_name, c.oid, privileges.privilege_name)
)
select ok(
  not exists (
    select object_name, role_name, privilege_name from actual
    except
    select object_name, role_name, privilege_name from expected
  ),
  'private table, view, and sequence grants are a subset of the SR-331 snapshot'
);

select is(
  (
    select string_agg(
      format('grantor=%s object_type=%s grantee=%s privilege=%s',
        pg_get_userbyid(d.defaclrole), d.defaclobjtype,
        coalesce(pg_get_userbyid(grant_entry.grantee), 'PUBLIC'),
        grant_entry.privilege_type),
      '; ' order by d.defaclrole, d.defaclobjtype, grant_entry.grantee, grant_entry.privilege_type
    )
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) as grant_entry
    where d.defaclnamespace = 'private'::regnamespace
      and (
        grant_entry.grantee = 0
        or (grant_entry.grantee <> 0 and pg_has_role(role_name, grant_entry.grantee, 'USAGE'))
      )
  ),
  null::text,
  format(
    '%s receives no default privileges in private from any grantor or object type',
    role_name
  )
)
from (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name);

create function private.sr331_default_execute_probe()
returns integer
language sql
as $$ select 1 $$;

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) grant_entry
    where p.oid = 'private.sr331_default_execute_probe()'::regprocedure
      and grant_entry.grantee = 0
      and grant_entry.privilege_type = 'EXECUTE'
  ),
  'new private functions do not grant EXECUTE to PUBLIC'
);

drop function private.sr331_default_execute_probe();

select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'service_role retains private schema usage'
);

select * from finish();
rollback;
