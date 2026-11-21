begin;
select plan(79);

-- Exact per-signature ACL for the people registry foundation routines.
create temporary table people_acl_expected (signature text, service boolean);
insert into people_acl_expected values
  ('private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])', false),
  ('private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)', false),
  ('private.people_is_registry_owner(uuid, uuid, uuid)', false),
  ('private.people_require_actor(uuid, uuid, boolean)', false),
  ('private.people_registry_enable(uuid, uuid, jsonb)', true),
  ('private.people_registry_get_control(uuid, uuid)', true),
  ('private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)', true),
  ('private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)', true),
  ('private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)', true),
  ('private.people_rule_value_valid(private.people_rule, jsonb)', false),
  ('private.people_lock_person(uuid, uuid)', false),
  ('private.people_bump_person(uuid, uuid, boolean)', false),
  ('private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)', true),
  ('private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)', true),
  ('private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])', true),
  ('private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)', true),
  ('private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)', true),
  ('private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)', true),
  ('private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)', true),
  ('private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)', true),
  ('private.people_begin_delete(uuid, uuid, uuid, boolean)', true),
  ('private.people_finish_delete(uuid, uuid, uuid)', true),
  ('private.people_lift_suppression(uuid, uuid, bytea, smallint)', true),
  ('private.people_list_persons(uuid, uuid, text, integer, uuid)', true),
  ('private.people_get_person(uuid, uuid, uuid)', true);

select is((select count(*) from people_acl_expected e
  where to_regprocedure(e.signature) is null), 0::bigint, 'every expected signature exists');
select ok(not has_function_privilege('anon', 'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_audit: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])', 'EXECUTE'), false,
  'private.people_audit: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])'::regprocedure),
  'people_registry_definer', 'private.people_audit: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_emit_change: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)', 'EXECUTE'), false,
  'private.people_emit_change: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)'::regprocedure),
  'people_registry_definer', 'private.people_emit_change: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_is_registry_owner(uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_is_registry_owner(uuid, uuid, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_is_registry_owner(uuid, uuid, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_is_registry_owner: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_is_registry_owner(uuid, uuid, uuid)', 'EXECUTE'), false,
  'private.people_is_registry_owner: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_is_registry_owner(uuid, uuid, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_is_registry_owner: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_require_actor(uuid, uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_require_actor(uuid, uuid, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_require_actor(uuid, uuid, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_require_actor: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_require_actor(uuid, uuid, boolean)', 'EXECUTE'), false,
  'private.people_require_actor: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_require_actor(uuid, uuid, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_require_actor: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_registry_enable(uuid, uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_registry_enable(uuid, uuid, jsonb)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_registry_enable(uuid, uuid, jsonb)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_registry_enable: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_registry_enable(uuid, uuid, jsonb)', 'EXECUTE'), true,
  'private.people_registry_enable: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_registry_enable(uuid, uuid, jsonb)'::regprocedure),
  'people_registry_definer', 'private.people_registry_enable: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_registry_get_control(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_registry_get_control(uuid, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_registry_get_control(uuid, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_registry_get_control: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_registry_get_control(uuid, uuid)', 'EXECUTE'), true,
  'private.people_registry_get_control: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_registry_get_control(uuid, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_registry_get_control: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_registry_set_manager: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)', 'EXECUTE'), true,
  'private.people_registry_set_manager: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_registry_set_manager: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_registry_set_binding: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)', 'EXECUTE'), true,
  'private.people_registry_set_binding: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_registry_set_binding: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_registry_set_flags: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)', 'EXECUTE'), true,
  'private.people_registry_set_flags: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_registry_set_flags: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_rule_value_valid(private.people_rule, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_rule_value_valid(private.people_rule, jsonb)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_rule_value_valid(private.people_rule, jsonb)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_rule_value_valid: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_rule_value_valid(private.people_rule, jsonb)', 'EXECUTE'), false,
  'private.people_rule_value_valid: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_rule_value_valid(private.people_rule, jsonb)'::regprocedure),
  'people_registry_definer', 'private.people_rule_value_valid: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_lock_person(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_lock_person(uuid, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_lock_person(uuid, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_lock_person: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_lock_person(uuid, uuid)', 'EXECUTE'), false,
  'private.people_lock_person: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_lock_person(uuid, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_lock_person: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_bump_person(uuid, uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_bump_person(uuid, uuid, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_bump_person(uuid, uuid, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_bump_person: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_bump_person(uuid, uuid, boolean)', 'EXECUTE'), false,
  'private.people_bump_person: service_role EXECUTE is withheld');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_bump_person(uuid, uuid, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_bump_person: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_create_person: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)', 'EXECUTE'), true,
  'private.people_create_person: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_create_person: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_update_person: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)', 'EXECUTE'), true,
  'private.people_update_person: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind)'::regprocedure),
  'people_registry_definer', 'private.people_update_person: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_add_identity: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])', 'EXECUTE'), true,
  'private.people_add_identity: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[])'::regprocedure),
  'people_registry_definer', 'private.people_add_identity: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_decide_identity: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)', 'EXECUTE'), true,
  'private.people_decide_identity: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_decide_identity(uuid, uuid, uuid, private.people_link_state)'::regprocedure),
  'people_registry_definer', 'private.people_decide_identity: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_set_fact: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)', 'EXECUTE'), true,
  'private.people_set_fact: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_set_fact: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_set_rule: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)', 'EXECUTE'), true,
  'private.people_set_rule: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_set_rule: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_set_consent: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)', 'EXECUTE'), true,
  'private.people_set_consent: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz)'::regprocedure),
  'people_registry_definer', 'private.people_set_consent: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_set_relationship: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)', 'EXECUTE'), true,
  'private.people_set_relationship: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_set_relationship: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_begin_delete(uuid, uuid, uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_begin_delete(uuid, uuid, uuid, boolean)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_begin_delete(uuid, uuid, uuid, boolean)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_begin_delete: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_begin_delete(uuid, uuid, uuid, boolean)', 'EXECUTE'), true,
  'private.people_begin_delete: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_begin_delete(uuid, uuid, uuid, boolean)'::regprocedure),
  'people_registry_definer', 'private.people_begin_delete: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_finish_delete(uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_finish_delete(uuid, uuid, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_finish_delete(uuid, uuid, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_finish_delete: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_finish_delete(uuid, uuid, uuid)', 'EXECUTE'), true,
  'private.people_finish_delete: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_finish_delete(uuid, uuid, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_finish_delete: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_lift_suppression(uuid, uuid, bytea, smallint)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_lift_suppression(uuid, uuid, bytea, smallint)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_lift_suppression(uuid, uuid, bytea, smallint)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_lift_suppression: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_lift_suppression(uuid, uuid, bytea, smallint)', 'EXECUTE'), true,
  'private.people_lift_suppression: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_lift_suppression(uuid, uuid, bytea, smallint)'::regprocedure),
  'people_registry_definer', 'private.people_lift_suppression: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_list_persons(uuid, uuid, text, integer, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_list_persons(uuid, uuid, text, integer, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_list_persons(uuid, uuid, text, integer, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_list_persons: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_list_persons(uuid, uuid, text, integer, uuid)', 'EXECUTE'), true,
  'private.people_list_persons: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_list_persons(uuid, uuid, text, integer, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_list_persons: owned by people_registry_definer');
select ok(not has_function_privilege('anon', 'private.people_get_person(uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.people_get_person(uuid, uuid, uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.people_get_person(uuid, uuid, uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'private.people_get_person: no PUBLIC, anon or authenticated EXECUTE');
select is(has_function_privilege('service_role', 'private.people_get_person(uuid, uuid, uuid)', 'EXECUTE'), true,
  'private.people_get_person: service_role EXECUTE is granted');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'private.people_get_person(uuid, uuid, uuid)'::regprocedure),
  'people_registry_definer', 'private.people_get_person: owned by people_registry_definer');

-- Static table and sequence revokes.
select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
  where c.relnamespace = 'private'::regnamespace and c.relkind = 'r' and c.relname = any (array[
    'people_registry_control', 'people_workspace_keys', 'people_registry_managers', 'people_channel_bindings',
    'people_persons', 'people_channel_identities', 'people_conversations', 'people_conversation_members',
    'people_relationships', 'people_facts', 'people_briefs', 'people_rules', 'people_consents',
    'people_suppressions', 'people_change_events', 'people_audit_events'])
    and has_table_privilege(caller, c.oid, privilege)
), 'no API role has any privilege on a registry table');
select is((select count(*) from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind = 'r'
  and c.relname = any (array['people_registry_control', 'people_workspace_keys', 'people_registry_managers',
    'people_channel_bindings', 'people_persons', 'people_channel_identities', 'people_conversations',
    'people_conversation_members', 'people_relationships', 'people_facts', 'people_briefs', 'people_rules',
    'people_consents', 'people_suppressions', 'people_change_events', 'people_audit_events'])), 16::bigint,
  'all sixteen registry tables exist');
select ok(not exists (
  select 1 from unnest(array['private.people_change_events_event_id_seq', 'private.people_audit_events_id_seq']) as s(name)
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as privilege
  where has_sequence_privilege(caller, s.name, privilege)
), 'no API role can use a registry sequence');

select * from finish();
rollback;
