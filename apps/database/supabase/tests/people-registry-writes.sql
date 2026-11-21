begin;
select plan(38);

-- Grants.
select ok(not has_function_privilege('anon',
    'private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'client roles cannot write bundles');
select ok(has_function_privilege('service_role',
  'private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'the service role writes bundles');
select ok((select p.proowner = 'people_registry_definer'::regrole and p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc p
    where p.oid = 'private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)'::regprocedure),
  'the writer belongs to the definer role with a pinned search path');
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  where has_table_privilege(caller, 'private.people_event_receipts', privilege)
), 'API roles have no receipt table privileges');
select ok(not has_schema_privilege('people_registry_definer', 'private', 'CREATE'), 'definer role keeps no CREATE');

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ae000000-0000-4000-8000-000000000001', 'writes-owner@example.com', now(), '{}', '{}'),
  ('ae000000-0000-4000-8000-000000000002', 'writes-other@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal) values
  ('ae100000-0000-4000-8000-000000000001', 'Writes tenant', 'ae000000-0000-4000-8000-000000000001', false),
  ('ae100000-0000-4000-8000-000000000002', 'Other tenant', 'ae000000-0000-4000-8000-000000000002', false);
create function pg_temp.keys() returns jsonb language sql as $$
  select jsonb_build_object('sender_lookup', encode(gen_random_bytes(60), 'base64'),
    'conversation_lookup', encode(gen_random_bytes(60), 'base64'), 'suppression', encode(gen_random_bytes(60), 'base64'),
    'display', encode(gen_random_bytes(60), 'base64'), 'audit', encode(gen_random_bytes(60), 'base64'));
$$;
select private.people_registry_enable('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
  pg_temp.keys());
select private.people_registry_enable('ae100000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000002',
  pg_temp.keys());
select private.people_registry_set_binding('ae100000-0000-4000-8000-000000000001',
  'ae000000-0000-4000-8000-000000000001', 'whatsapp', 'writes-acct', false);
insert into private.fleet_desk_owners
  (channel, provider_account_id, provider_account_label, desk_id, credential_version, quiesced)
  values ('whatsapp', 'writes-desk', 'Writes desk', 'desk-writes', 1, false);
insert into private.people_channel_bindings (channel, provider_account_id, ws_id, added_by)
  values ('whatsapp', 'writes-desk', 'ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001');

create temporary table people_test_ids (name text primary key, id uuid not null);
create function pg_temp.id(p_name text) returns uuid language sql as $$
  select id from people_test_ids where name = p_name;
$$;
insert into people_test_ids values
  ('responder', (private.people_register_principal('ae100000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000001', 'responder', 'writer', 'kid-writes-responder', gen_random_bytes(32), 600)
    ->> 'principalId')::uuid),
  ('other', (private.people_register_principal('ae100000-0000-4000-8000-000000000002',
    'ae000000-0000-4000-8000-000000000002', 'responder', 'other', 'kid-writes-other', gen_random_bytes(32), 600)
    ->> 'principalId')::uuid),
  ('lan', private.people_create_person('ae100000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000001', 'person', 'Lan', false)),
  ('minh', private.people_create_person('ae100000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000001', 'person', 'Minh', false));
insert into private.people_channel_identities (ws_id, person_id, channel, provider_account_id, lookup_hash,
  key_version, suppression_token, suppression_key_version, verification, link_state, basis, decided_at) values
  ('ae100000-0000-4000-8000-000000000001', pg_temp.id('lan'), 'whatsapp', 'writes-acct',
    decode(repeat('a1', 32), 'hex'), 1, gen_random_bytes(32), 1, 'asserted', 'confirmed', 'owner_statement', now()),
  ('ae100000-0000-4000-8000-000000000001', pg_temp.id('minh'), 'whatsapp', 'writes-acct',
    decode(repeat('a2', 32), 'hex'), 1, gen_random_bytes(32), 1, 'asserted', 'confirmed', 'owner_statement', now());

create function pg_temp.event(p_id text, p_account text default 'writes-acct') returns jsonb language sql as $$
  select jsonb_build_object('channel', 'whatsapp', 'account', p_account,
    'eventHash', encode(sha256(convert_to(p_id, 'UTF8')), 'hex'));
$$;
create function pg_temp.write(
  p_id text, p_sender text default 'a1', p_conversation text default 'c1', p_type text default 'private_1_to_1',
  p_account text default 'writes-acct', p_input text default repeat('0', 64), p_principal text default 'responder',
  p_items jsonb default '[{"type": "observe_sender"}]'
) returns jsonb language sql as $$
  select private.people_write_event('ae100000-0000-4000-8000-000000000001', pg_temp.id(p_principal),
    pg_temp.event(p_id, p_account), p_input, p_type,
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat(p_sender, 32))),
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat(p_conversation, 32))),
    jsonb_build_object('version', 1, 'hash', repeat(p_conversation, 32)), p_items);
$$;
create function pg_temp.slot(p_id text, p_account text default 'writes-acct') returns text language sql as $$
  select coalesce((select coalesce(e.exclusive_slot, 'none') from private.fleet_provider_events e
    where e.channel = 'whatsapp' and e.provider_account_id = p_account
      and e.event_hash = sha256(convert_to(p_id, 'UTF8'))), 'absent');
$$;
create function pg_temp.members(p_conversation text) returns bigint language sql as $$
  select count(*) from private.people_conversation_members m
  join private.people_conversations c on c.ws_id = m.ws_id and c.id = m.conversation_id
  where c.lookup_hash = decode(repeat(p_conversation, 32), 'hex');
$$;
create temporary table people_test_fleet_identities as select count(*) as n from private.fleet_channel_identities;

-- A first observation in a new DM.
select is(pg_temp.write('evt-1') #>> '{items,0,result}', 'created', 'a confirmed sender is observed');
select is((select kind::text from private.people_conversations where lookup_hash = decode(repeat('c1', 32), 'hex')),
  'dm', 'the DM is created under the current lookup key');
select is(pg_temp.members('c1'), 1::bigint, 'the sender becomes a member');
select is((select verification::text from private.people_channel_identities where person_id = pg_temp.id('lan')),
  'desk_observed', 'an asserted identity is marked desk observed');
select is(pg_temp.slot('evt-1'), 'registry_write', 'the bundle takes the registry write slot');
select is(private.fleet_consume_provider_event(pg_temp.event('evt-1')), false,
  'a written event can no longer serve Fleet');

-- Retries.
select is(pg_temp.write('evt-1') -> 'replayed', 'true'::jsonb, 'the same bundle replays its receipt');
select is(pg_temp.write('evt-1') #>> '{items,0,result}', 'created', 'the replay returns the original items');
select is(pg_temp.write('evt-1', p_input => repeat('1', 64)) ->> 'reason', 'event_consumed',
  'a different bundle for a consumed event is refused');
select is(pg_temp.members('c1'), 1::bigint, 'replays write nothing');
select is(pg_temp.write('evt-2') #>> '{items,0,result}', 'duplicate', 'a repeated observation is a duplicate');

-- Groups.
select is(pg_temp.write('evt-group', p_conversation => 'c2', p_type => 'group') ->> 'reason', 'ok',
  'a group observation is accepted');
select is(pg_temp.write('evt-group-2', p_sender => 'a2', p_conversation => 'c2', p_type => 'group')
  #>> '{items,0,result}', 'created', 'a second member joins the group');
select is(pg_temp.members('c2'), 2::bigint, 'the group records both members');
select is(pg_temp.write('evt-kind', p_conversation => 'c2') ->> 'reason', 'scope_denied',
  'a group hash cannot be written as a DM');
select is((select count(*) from private.fleet_channel_identities), (select n from people_test_fleet_identities),
  'writes never touch Fleet channel identities');

-- Refusals.
select is(pg_temp.write('evt-unknown', p_sender => 'b1', p_conversation => 'c3') ->> 'reason', 'unknown_sender',
  'an unknown sender is refused');
select ok(not exists (select 1 from private.people_conversations where lookup_hash = decode(repeat('c3', 32), 'hex')),
  'a refused bundle writes no conversation');
select is(pg_temp.write('evt-unknown', p_sender => 'b1', p_conversation => 'c3') ->> 'reason', 'unknown_sender',
  'a refused bundle replays its refusal');
select is(pg_temp.write('evt-unbound', p_account => 'writes-unbound') ->> 'reason', 'scope_denied',
  'an unbound account is refused');
select is(pg_temp.slot('evt-unbound', 'writes-unbound'), 'absent', 'an unbound refusal takes no slot');
select is(private.fleet_consume_provider_event(pg_temp.event('evt-unbound', 'writes-unbound')), true,
  'the Fleet slot stays free after an unbound refusal');
select is(pg_temp.write('evt-desk', p_account => 'writes-desk') ->> 'reason', 'scope_denied',
  'a Fleet desk account is refused');
select is(pg_temp.slot('evt-desk', 'writes-desk'), 'absent', 'a desk refusal takes no slot');
select ok(private.fleet_consume_provider_event(pg_temp.event('evt-fleet-first')), 'Fleet consumes an event first');
select is(pg_temp.write('evt-fleet-first') ->> 'reason', 'event_consumed', 'a Fleet event cannot also be written');
select is(pg_temp.write('evt-tenant', p_principal => 'other') ->> 'reason', 'principal_refused',
  'another tenant principal is refused');
select is(pg_temp.slot('evt-tenant'), 'absent', 'a principal refusal takes no slot');
select private.people_set_consent('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
  pg_temp.id('minh'), null, 'profile', 'denied', 'owner_attested', '{"note": "asked to stop"}', null, null);
select is(pg_temp.write('evt-denied', p_sender => 'a2', p_conversation => 'c4') ->> 'reason', 'consent_required',
  'a denied profile consent refuses the bundle');
select ok(not exists (select 1 from private.people_conversations where lookup_hash = decode(repeat('c4', 32), 'hex')),
  'a consent refusal writes no conversation');
select throws_ok($$select pg_temp.write('evt-bad', p_items => '[{"type": "observe_sender", "extra": 1}]')$$,
  '22023', null, 'unknown item fields are refused');
select throws_ok($$select private.people_write_event('ae100000-0000-4000-8000-000000000001', pg_temp.id('responder'),
  pg_temp.event('evt-current'), repeat('0', 64), 'private_1_to_1',
  jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('a1', 32))),
  jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('c1', 32))),
  jsonb_build_object('version', 1, 'hash', repeat('c9', 32)), '[{"type": "observe_sender"}]')$$,
  '22023', null, 'the current conversation hash must be one of the lookups');
select ok(exists (select 1 from private.people_audit_events a
    where a.principal_id = pg_temp.id('responder') and a.action = 'write.bundle' and a.reason_code = 'accepted'),
  'accepted bundles are audited by principal');

select * from finish();
rollback;
