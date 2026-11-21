begin;
select plan(99);

-- Storage and privilege boundary.
create temporary view people_registry_test_tables as
select oid, relname, relrowsecurity from pg_class
where relnamespace = 'private'::regnamespace and relkind = 'r' and relname like 'people\_%';
select is((select count(*) from people_registry_test_tables), 22::bigint, 'registry tables exist');
select ok(not exists (select 1 from people_registry_test_tables where not relrowsecurity),
  'every registry table has RLS enabled');
select ok(not exists (
  select 1 from people_registry_test_tables t
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
  where has_table_privilege(caller, t.oid, privilege)
), 'API roles have no direct registry table privileges');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname like 'people\_%'
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'client roles cannot execute registry functions');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname in (
    'people_audit', 'people_emit_change', 'people_require_actor', 'people_rule_value_valid',
    'people_lock_person', 'people_bump_person', 'people_workspace_creator', 'people_user_exists',
    'people_is_registry_owner'
  ) and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'internal registry helpers are not executable by the service role');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname like 'people\_%' and p.prosecdef
    and pg_get_userbyid(p.proowner) <> 'people_registry_definer'
    and p.proname not in ('people_workspace_creator', 'people_user_exists')
), 'registry definers are owned by people_registry_definer');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace and (p.proname like 'people\_%' or p.proname in (
    'fleet_list_user_channel_identities', 'fleet_consume_registry_event', 'fleet_is_owner'))
    and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=pg_catalog, pg_temp'], false)
), 'registry definers pin search_path');
select ok((select rolcanlogin = false and rolbypassrls = false and rolsuper = false
  from pg_roles where rolname = 'people_registry_definer'), 'definer role cannot log in or bypass RLS');
select ok(not has_schema_privilege('people_registry_definer', 'private', 'CREATE'),
  'definer role cannot create objects');
select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  where c.relnamespace = 'private'::regnamespace and c.relkind = 'r' and c.relname like 'fleet\_%'
    and has_table_privilege('people_registry_definer', c.oid, privilege)
), 'definer role has no Fleet table privileges');
select ok(
  has_function_privilege('people_registry_definer', 'private.fleet_consume_registry_event(jsonb, text)', 'EXECUTE')
  and has_function_privilege('people_registry_definer', 'private.fleet_list_user_channel_identities(uuid)', 'EXECUTE')
  and not has_function_privilege('people_registry_definer', 'private.fleet_consume_provider_event(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.fleet_consume_registry_event(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.fleet_list_user_channel_identities(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.fleet_is_owner(uuid)', 'EXECUTE'),
  'Fleet reaches the registry only through its narrow wrappers');
select is((select array_agg(a.attname::text order by a.attnum) from pg_proc p
  cross join unnest(p.proargnames) with ordinality as a(attname, attnum)
  where p.oid = 'private.fleet_list_user_channel_identities(uuid)'::regprocedure and p.proargmodes[a.attnum] = 't'),
  array['channel', 'provider_account_id', 'verified_at'], 'Fleet identity read returns no hashes');

-- Replay namespace shared with Fleet. Each call is its own assertion so the
-- order of side effects is explicit.
select ok(not has_function_privilege('people_registry_definer', 'private.fleet_take_event_slot(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.fleet_take_event_slot(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.fleet_take_event_slot(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.fleet_take_event_slot(jsonb, text)', 'EXECUTE'),
  'the slot helper is not executable by API roles or the registry definer');
select throws_ok($$select private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('a', 64) || '"}')::jsonb, 'intent.submit')$$,
  '22023', null, 'registry wrapper refuses Fleet operations');
select throws_ok($$select private.fleet_consume_provider_event(('{"channel":"zalo","eventHash":"' || repeat('a', 64) || '"}')::jsonb)$$,
  '22023', null, 'a missing account is rejected on the Fleet path');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('b', 64) || '"}')::jsonb, 'registry.write'), 'a fresh event admits one write');
select is((select row(exclusive_slot, recall_consumed_at is not null, attempts)::text from private.fleet_provider_events where provider_account_id = 'acct' and event_hash = decode(repeat('b', 64), 'hex')), '(registry_write,f,1)', 'the write slot is recorded');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('b', 64) || '"}')::jsonb, 'registry.write'), 'a second write is refused');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('b', 64) || '"}')::jsonb, 'registry.recall'), 'one recall coexists with the write');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('b', 64) || '"}')::jsonb, 'registry.recall'), 'a second recall is refused');
select ok(not private.fleet_consume_provider_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('b', 64) || '"}')::jsonb), 'Fleet cannot spend an event used by a registry write');
select is((select row(exclusive_slot, recall_consumed_at is not null, attempts)::text from private.fleet_provider_events where provider_account_id = 'acct' and event_hash = decode(repeat('b', 64), 'hex')), '(registry_write,t,5)', 'refused attempts are counted');
select ok(private.fleet_consume_provider_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('c', 64) || '"}')::jsonb), 'Fleet consumes a fresh event');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('c', 64) || '"}')::jsonb, 'registry.write'), 'a registry write cannot spend an event used by Fleet');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('d', 64) || '"}')::jsonb, 'registry.recall'), 'recall consumes a fresh event first');
select ok(private.fleet_consume_provider_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('d', 64) || '"}')::jsonb), 'a recall-first event still admits Fleet');
select ok(not private.fleet_consume_provider_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('d', 64) || '"}')::jsonb), 'Fleet replay is still refused');
select is((select row(exclusive_slot, recall_consumed_at is not null, attempts)::text from private.fleet_provider_events where provider_account_id = 'acct' and event_hash = decode(repeat('d', 64), 'hex')), '(fleet,t,3)', 'recall and Fleet share one record');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('e', 64) || '"}')::jsonb, 'registry.recall'), 'attempt 1 consumes recall');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('e', 64) || '"}')::jsonb, 'registry.recall'), 'attempt 2 is a refused replay');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('e', 64) || '"}')::jsonb, 'registry.recall'), 'attempt 3 is a refused replay');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('e', 64) || '"}')::jsonb, 'registry.recall'), 'attempt 4 is a refused replay');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('e', 64) || '"}')::jsonb, 'registry.write'), 'attempt 5 can still take an open slot');
select ok(private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.recall'), 'cap fixture: attempt 1');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.recall'), 'cap fixture: attempt 2 refused');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.recall'), 'cap fixture: attempt 3 refused');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.recall'), 'cap fixture: attempt 4 refused');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.recall'), 'cap fixture: attempt 5 refused');
select ok(not private.fleet_consume_registry_event(('{"channel":"zalo","account":"acct","eventHash":"' || repeat('f', 64) || '"}')::jsonb, 'registry.write'), 'attempt 6 is refused even for an open slot');
select is((select row(exclusive_slot, recall_consumed_at is not null, attempts)::text from private.fleet_provider_events where provider_account_id = 'acct' and event_hash = decode(repeat('f', 64), 'hex')), '(,t,6)', 'the capped event keeps its write slot open but unusable');

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ab000000-0000-4000-8000-000000000001', 'people-owner@example.com', now(), '{}', '{}'),
  ('ab000000-0000-4000-8000-000000000002', 'people-manager@example.com', now(), '{}', '{}'),
  ('ab000000-0000-4000-8000-000000000003', 'people-outsider@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal) values
  ('ab100000-0000-4000-8000-000000000001', 'People tenant A', 'ab000000-0000-4000-8000-000000000001', false),
  ('ab100000-0000-4000-8000-000000000002', 'People tenant B', 'ab000000-0000-4000-8000-000000000003', false);
create temporary table people_test_keys as select jsonb_build_object(
  'sender_lookup', encode(gen_random_bytes(60), 'base64'),
  'conversation_lookup', encode(gen_random_bytes(60), 'base64'),
  'suppression', encode(gen_random_bytes(60), 'base64'),
  'display', encode(gen_random_bytes(60), 'base64'),
  'audit', encode(gen_random_bytes(60), 'base64')) as keys;

-- Bootstrap.
select throws_ok($$select private.people_registry_enable('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000003', (select keys from people_test_keys))$$,
  '42501', null, 'only the workspace creator can enable a tenant registry');
select throws_ok($$select private.people_registry_enable('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', (select keys from people_test_keys))$$,
  '42501', null, 'the root registry needs the live Fleet owner');
select throws_ok($$select private.people_registry_enable('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select keys - 'audit' from people_test_keys))$$,
  '22023', null, 'a missing wrapped key aborts the bootstrap');
select ok(not exists (select 1 from private.people_registry_control where ws_id = 'ab100000-0000-4000-8000-000000000001'),
  'an aborted bootstrap leaves no registry');
select is(private.people_registry_enable('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select keys from people_test_keys)) ->> 'reason', 'enabled', 'the creator enables the tenant registry');
select is(private.people_registry_enable('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select keys from people_test_keys)) ->> 'reason', 'already_enabled', 'bootstrap happens once');
select is((select count(*) from private.people_workspace_keys where ws_id = 'ab100000-0000-4000-8000-000000000001'), 5::bigint, 'one wrapped key per purpose');
select is(private.people_registry_enable('ab100000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003', (select keys from people_test_keys)) ->> 'reason', 'enabled', 'a second tenant enables its own registry');

-- Owner and managers.
select throws_ok($$select private.people_list_persons('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', null, 10, null)$$,
  '42501', null, 'a workspace user without a manager row is refused');
select throws_ok($$select private.people_registry_set_manager('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000002', null, false)$$,
  '42501', null, 'another tenant owner cannot add managers');
select is(private.people_registry_set_manager('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', null, false) ->> 'reason', 'updated', 'the owner adds a manager');
select is(private.people_list_persons('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', null, 10, null), '[]'::jsonb, 'a manager can list');
select throws_ok($$select private.people_registry_set_manager('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003', null, false)$$,
  '42501', null, 'managers cannot delegate');
select is((private.people_registry_get_control('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002') ->> 'isOwner')::boolean, false, 'a manager is not the owner');

-- Bindings.
create temporary table people_test_generation as
  select generation as before from private.people_registry_control where ws_id = 'ab100000-0000-4000-8000-000000000002';
select is(private.people_registry_set_binding('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'zalo', 'oa-1', false) ->> 'reason', 'updated', 'owner binds an account');
select is(private.people_registry_set_binding('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'zalo', 'oa-1', false) ->> 'reason', 'unchanged', 'rebinding is a no-op');
select is(private.people_registry_set_binding('ab100000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003', 'zalo', 'oa-1', false) ->> 'reason',
  'bound_elsewhere', 'an account serves one workspace');
select is((select generation from private.people_registry_control where ws_id = 'ab100000-0000-4000-8000-000000000002'),
  (select before from people_test_generation), 'a refused binding does not advance the generation');

-- Records.
create temporary table people_test_ids as select
  private.people_create_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'person', 'Test person', false) as person_a,
  private.people_create_person('ab100000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003', 'person', 'Other tenant', false) as person_b,
  private.people_create_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'person', 'Second person', false) as person_c;
select is((select count(*) from private.people_consents c join people_test_ids t on c.person_id = t.person_a
  where c.state = 'unknown'), 3::bigint, 'new people start with unknown consent');
select is(private.people_update_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), 99, 'Renamed', null) ->> 'reason',
  'revision_conflict', 'stale person versions conflict');
select is(private.people_update_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), null, 'Renamed', null) ->> 'reason',
  'revision_conflict', 'a missing person version conflicts');
select is((select label from private.people_persons where id = (select person_a from people_test_ids)), 'Test person', 'refused updates leave the row unchanged');
select throws_ok($$select private.people_set_relationship('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), (select person_b from people_test_ids), 'friend', null, 1, false)$$,
  'P0002', null, 'relationships cannot cross workspaces');
select is(private.people_set_relationship('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', (select person_a from people_test_ids), (select person_c from people_test_ids), 'colleague', null, 1, false) ->> 'reason',
  'updated', 'a manager edits relationships');
select throws_ok($$select private.people_set_rule('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'person', null, (select person_a from people_test_ids), null,
  'reply_mode', '"always"', null, null, false)$$, '22023', null, 'rule values are enumerated');
select is(private.people_set_rule('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', 'person', null, (select person_a from people_test_ids), null,
  'quiet_hours', '{"start":"22:30","end":"07:00","timezone":"Asia/Ho_Chi_Minh","mode":"shorten"}', null, null, false)
  ->> 'reason', 'updated', 'a manager publishes structured rules');
select throws_ok($$select private.people_set_consent('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', (select person_a from people_test_ids), null, 'memory', 'granted',
  'owner_attested', '{"note":"attested"}', '{}', null)$$, '42501', null, 'managers cannot record consent');
select throws_ok($$select private.people_set_consent('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), null, 'memory', 'granted',
  'imported', '{}', '{}', null)$$, '22023', null, 'nobody records an imported basis by hand');
select throws_ok($$select private.people_set_consent('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), null, 'memory', 'granted',
  'subject_given', '{}', '{}', null)$$, '22023', null, 'subject consent needs a message reference');
select is(private.people_set_fact('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', (select person_a from people_test_ids), 'preferred_name', 'Test', null, null, null, null, false) ->> 'reason',
  'updated', 'a manager stores facts');
select is(private.people_set_fact('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), 'preferred_name', 'Again', null, null, null, null, false) ->> 'reason',
  'revision_conflict', 'fact edits need the current revision');
select throws_ok($$select private.people_add_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), 'zalo', 'oa-1', decode(repeat('11', 32), 'hex'), 1::smallint, null,
  'owner_statement', decode(repeat('21', 32), 'hex'), 1::smallint, array[decode(repeat('99', 32), 'hex')])$$, '22023', null, 'identities need suppression coverage');
select is(private.people_add_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), 'zalo', 'oa-1', decode(repeat('11', 32), 'hex'), 1::smallint, null, 'same_name', decode(repeat('21', 32), 'hex'), 1::smallint, array[decode(repeat('21', 32), 'hex')]) ->> 'reason', 'proposed', 'identities start as proposals');
select is(private.people_decide_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select id from private.people_channel_identities where person_id = (select person_a from people_test_ids)),
  'confirmed') ->> 'reason', 'confirmation_conflict', 'a same-name match cannot be confirmed');
select is(private.people_add_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_c from people_test_ids), 'zalo', 'oa-1', decode(repeat('11', 32), 'hex'), 1::smallint, null, 'owner_statement', decode(repeat('21', 32), 'hex'), 1::smallint, array[decode(repeat('21', 32), 'hex')]) ->> 'reason', 'proposed',
  'another person can be proposed for the same identity');

-- Deletion fence.
select throws_ok($$select private.people_begin_delete('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', (select person_a from people_test_ids), false)$$, '42501', null, 'managers cannot delete');
select is(private.people_begin_delete('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), false) ->> 'reason', 'fenced', 'deletion fences the person');
select is((select count(*) from private.people_suppressions where ws_id = 'ab100000-0000-4000-8000-000000000001' and token = decode(repeat('21', 32), 'hex')), 1::bigint,
  'the fence suppresses the locked identities');
select ok(not exists (select 1 from jsonb_array_elements(private.people_list_persons('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', null, 50, null)) e
  where e ->> 'id' = (select person_a from people_test_ids)::text), 'a deleting person leaves listings');
select is(jsonb_array_length(private.people_get_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_c from people_test_ids)) -> 'relationships'), 0,
  'relationship projections hide a deleting person');
select is(private.people_get_person('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids)) - 'id' - 'version', '{"status":"deleting"}'::jsonb,
  'a deleting person exposes only its status');
select throws_ok($$select private.people_set_fact('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids), 'language', 'vi', null, null, null, null, false)$$,
  '55000', null, 'writers are refused while deleting');
select is(private.people_decide_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select id from private.people_channel_identities where person_id = (select person_c from people_test_ids)),
  'confirmed') ->> 'reason', 'suppressed', 'a suppressed identity cannot be confirmed for another person');
select is(private.people_add_identity('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_c from people_test_ids), 'zalo', 'oa-1', decode(repeat('12', 32), 'hex'), 1::smallint, null, 'owner_statement', decode(repeat('21', 32), 'hex'), 1::smallint, array[decode(repeat('21', 32), 'hex')]) ->> 'reason', 'suppressed', 'a suppressed identity cannot be re-added');
select throws_ok($$select private.people_finish_delete('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', (select person_a from people_test_ids))$$, '42501', null, 'managers cannot finish deletion');
select is(private.people_finish_delete('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', (select person_a from people_test_ids)) ->> 'reason', 'deleted', 'deletion finishes');
select ok(not exists (select 1 from private.people_facts f where f.person_id = (select person_a from people_test_ids))
  and not exists (select 1 from private.people_channel_identities i where i.person_id = (select person_a from people_test_ids))
  and (select label = 'deleted' and status = 'deleted' from private.people_persons p where p.id = (select person_a from people_test_ids)),
  'deletion leaves a content-free tombstone');
select is(private.people_add_identity('ab100000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000003', (select person_b from people_test_ids), 'zalo', 'oa-2', decode(repeat('11', 32), 'hex'), 1::smallint, null, 'owner_statement', decode(repeat('21', 32), 'hex'), 1::smallint, array[decode(repeat('21', 32), 'hex')]) ->> 'reason', 'proposed',
  'another workspace is unaffected by the first workspace fence');
select is((select kind::text from private.people_change_events where person_id = (select person_a from people_test_ids) order by event_id desc limit 1),
  'delete', 'deletion emits a delete change event');

-- Root ownership follows the live Fleet owner.
select ok(not private.fleet_is_owner('ab000000-0000-4000-8000-000000000001'), 'no Fleet owner is configured');
insert into public.workspaces (id, name, creator_id, personal)
  values ('00000000-0000-0000-0000-000000000000', 'People SQL root', 'ab000000-0000-4000-8000-000000000001', false)
  on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000002', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;
update private.fleet_control set owner_user_id = 'ab000000-0000-4000-8000-000000000001';
select ok(not private.fleet_is_owner('ab000000-0000-4000-8000-000000000001'), 'the configured owner without a live root grant is not the owner');
select private.grant_mastermind_access('ab000000-0000-4000-8000-000000000001', 'People SQL fixture');
select ok(private.fleet_is_owner('ab000000-0000-4000-8000-000000000001'), 'the configured owner with a live grant is the owner');
select is(private.people_registry_enable('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', (select keys from people_test_keys)) ->> 'reason',
  'enabled', 'the live Fleet owner enables the root registry');
select is(private.people_list_persons('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', null, 10, null), '[]'::jsonb,
  'the root owner reads the root registry');
select private.revoke_mastermind_access('ab000000-0000-4000-8000-000000000001', 'People SQL fixture');
select private.grant_mastermind_access('ab000000-0000-4000-8000-000000000002', 'People SQL fixture');
update private.fleet_control set owner_user_id = 'ab000000-0000-4000-8000-000000000002';
select is(private.people_list_persons('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000002', null, 10, null), '[]'::jsonb,
  'a transferred Fleet owner reads the root registry');
select throws_ok($$select private.people_list_persons('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', null, 10, null)$$,
  '42501', null, 'the former owner loses root registry access');
select private.revoke_mastermind_access('ab000000-0000-4000-8000-000000000002', 'People SQL fixture');
select throws_ok($$select private.people_list_persons('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000002', null, 10, null)$$,
  '42501', null, 'revoking the live grant removes root registry access');

-- Manager expiry.
update private.people_registry_managers set expires_at = now() - interval '1 minute' where user_id = 'ab000000-0000-4000-8000-000000000002' and ws_id = 'ab100000-0000-4000-8000-000000000001';
select throws_ok($$select private.people_list_persons('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', null, 10, null)$$, '42501', null, 'an expired manager is refused');

-- Audit.
select throws_ok($$update private.people_audit_events set reason_code = 'tampered'$$,
  '55000', 'People audit events are append-only', 'audit updates are rejected');

select * from finish();
rollback;
