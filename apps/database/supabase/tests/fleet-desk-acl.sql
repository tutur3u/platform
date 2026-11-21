begin;
select plan(24);

select ok(
  not has_function_privilege('public', p.oid, 'EXECUTE'),
  format('%s is not executable by public', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure,
  'private.fleet_admit_intent()'::regprocedure
)
order by p.oid::regprocedure::text;

select ok(
  not has_function_privilege('anon', p.oid, 'EXECUTE'),
  format('%s is not executable by anon', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure,
  'private.fleet_admit_intent()'::regprocedure
)
order by p.oid::regprocedure::text;

select ok(
  not has_function_privilege('authenticated', p.oid, 'EXECUTE'),
  format('%s is not executable by authenticated', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure,
  'private.fleet_admit_intent()'::regprocedure
)
order by p.oid::regprocedure::text;

select ok(
  has_function_privilege('service_role', p.oid, 'EXECUTE'),
  format('%s is executable by service_role', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure
)
order by p.oid::regprocedure::text;

select ok(
  not has_function_privilege('service_role', 'private.fleet_admit_intent()'::regprocedure, 'EXECUTE'),
  'private.fleet_admit_intent() is not executable by service_role'
);

select is(
  pg_get_userbyid(p.proowner)::text,
  'postgres',
  format('%s is owned by postgres', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure,
  'private.fleet_admit_intent()'::regprocedure
)
order by p.oid::regprocedure::text;

select is(
  p.proacl::text[],
  array['postgres=X/postgres', 'service_role=X/postgres']::text[],
  format('%s proacl is exactly postgres and service_role', p.oid::regprocedure)
)
from pg_proc p
where p.oid in (
  'private.fleet_verify_link_code(bytea,bytea,jsonb)'::regprocedure,
  'private.fleet_submit_resolved_intent(private.fleet_intent_kind,text,text,jsonb,uuid,jsonb,text)'::regprocedure,
  'private.fleet_get_digest(uuid)'::regprocedure
)
order by p.oid::regprocedure::text;

select is(
  p.proacl::text[],
  array['postgres=X/postgres']::text[],
  'private.fleet_admit_intent() proacl is exactly postgres'
)
from pg_proc p
where p.oid = 'private.fleet_admit_intent()'::regprocedure;

select * from finish();
rollback;
