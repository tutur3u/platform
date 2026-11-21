begin;
select plan(32);

-- Grants.
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_machine_capture_keys', 'people_valid_capture', 'people_propose_sender')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'client roles cannot execute capture functions');
select ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_valid_capture', 'people_propose_sender')
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'the service role cannot call the capture helpers');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_machine_capture_keys', 'people_valid_capture', 'people_propose_sender',
      'people_write_event')
    and p.proowner = 'people_registry_definer'::regrole
    and p.proconfig @> array['search_path=pg_catalog, pg_temp']), 4,
  'capture functions belong to the definer role with a pinned search path');
select ok(not has_schema_privilege('people_registry_definer', 'private', 'CREATE'), 'definer role keeps no CREATE');

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('af000000-0000-4000-8000-000000000001', 'capture-owner@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal) values
  ('af100000-0000-4000-8000-000000000001', 'Capture tenant', 'af000000-0000-4000-8000-000000000001', false);
select private.people_registry_enable('af100000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001',
  jsonb_build_object('sender_lookup', encode(gen_random_bytes(60), 'base64'),
    'conversation_lookup', encode(gen_random_bytes(60), 'base64'), 'suppression', encode(gen_random_bytes(60), 'base64'),
    'display', encode(gen_random_bytes(60), 'base64'), 'audit', encode(gen_random_bytes(60), 'base64')));
select private.people_registry_set_binding('af100000-0000-4000-8000-000000000001',
  'af000000-0000-4000-8000-000000000001', 'zalo', 'capture-acct', false);
create temporary table people_test_ids (name text primary key, id uuid not null);
create function pg_temp.id(p_name text) returns uuid language sql as $$
  select id from people_test_ids where name = p_name;
$$;
insert into people_test_ids values ('responder', (private.people_register_principal(
  'af100000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 'responder', 'capture',
  'kid-capture-responder', gen_random_bytes(32), 600) ->> 'principalId')::uuid);
insert into private.people_conversations (ws_id, channel, provider_account_id, lookup_hash, key_version, kind)
  values ('af100000-0000-4000-8000-000000000001', 'zalo', 'capture-acct', decode(repeat('c1', 32), 'hex'), 1, 'group');
insert into people_test_ids select 'group', id from private.people_conversations
  where ws_id = 'af100000-0000-4000-8000-000000000001';

create function pg_temp.event(p_id text) returns jsonb language sql as $$
  select jsonb_build_object('channel', 'zalo', 'account', 'capture-acct',
    'eventHash', encode(sha256(convert_to(p_id, 'UTF8')), 'hex'));
$$;
create function pg_temp.item(p_sender text, p_label text default 'Hoa', p_token text default null) returns jsonb
language sql as $$
  select jsonb_build_object('type', 'observe_sender', 'label', p_label, 'capture', jsonb_build_object(
    'personId', gen_random_uuid(),
    'lookup', jsonb_build_object('version', 1, 'hash', repeat(p_sender, 32)),
    'suppression', jsonb_build_object('version', 1, 'token', coalesce(p_token, repeat('5' || left(p_sender, 1), 32))),
    'checks', jsonb_build_array(coalesce(p_token, repeat('5' || left(p_sender, 1), 32))),
    'display', repeat('ab', 40)));
$$;
create function pg_temp.write(p_id text, p_item jsonb, p_sender text default 'b1') returns jsonb language sql as $$
  select private.people_write_event('af100000-0000-4000-8000-000000000001', pg_temp.id('responder'),
    pg_temp.event(p_id), repeat('0', 64), 'group',
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat(p_sender, 32))),
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('c1', 32))),
    jsonb_build_object('version', 1, 'hash', repeat('c1', 32)), jsonb_build_array(p_item));
$$;
create function pg_temp.slot(p_id text) returns text language sql as $$
  select coalesce((select coalesce(e.exclusive_slot, 'none') from private.fleet_provider_events e
    where e.channel = 'zalo' and e.provider_account_id = 'capture-acct'
      and e.event_hash = sha256(convert_to(p_id, 'UTF8'))), 'absent');
$$;
create function pg_temp.people(p_label text) returns bigint language sql as $$
  select count(*) from private.people_persons
  where ws_id = 'af100000-0000-4000-8000-000000000001' and label = p_label;
$$;

-- Capture off.
select is(private.people_machine_capture_keys('af100000-0000-4000-8000-000000000001', pg_temp.id('responder')),
  '[]'::jsonb, 'capture keys stay hidden while capture is off');
select is(pg_temp.write('evt-off', pg_temp.item('b1')) ->> 'reason', 'unknown_sender',
  'an unknown sender is not proposed while capture is off');
select is(pg_temp.people('Hoa'), 0::bigint, 'nothing is proposed while capture is off');

-- Capture on, consent per conversation.
select private.people_registry_set_flags('af100000-0000-4000-8000-000000000001',
  'af000000-0000-4000-8000-000000000001', true, null, null);
select is((select array_agg(distinct e ->> 'purpose' order by e ->> 'purpose') from jsonb_array_elements(
    private.people_machine_capture_keys('af100000-0000-4000-8000-000000000001', pg_temp.id('responder'))) e),
  array['display', 'suppression'], 'capture keys are the suppression and display keys');
select is(pg_temp.write('evt-no-consent', pg_temp.item('b1')) ->> 'reason', 'consent_required',
  'capture needs the conversation capture consent');
select private.people_set_consent('af100000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001',
  null, pg_temp.id('group'), 'capture', 'granted', 'owner_attested', '{"note": "team group"}', null, null);
select is(pg_temp.write('evt-no-label', pg_temp.item('b1') - 'label') ->> 'reason', 'unknown_sender',
  'a proposal needs a label');

-- Proposal.
select is(pg_temp.write('evt-propose', pg_temp.item('b1')) #>> '{items,0,result}', 'proposed',
  'an unknown sender is proposed');
select is(pg_temp.people('Hoa'), 1::bigint, 'one person is proposed');
select is((select link_state::text || ':' || verification::text || ':' || basis::text || ':' || evidence_ref
    from private.people_channel_identities where lookup_hash = decode(repeat('b1', 32), 'hex')),
  'proposed:desk_observed:self_introduction:desk_capture', 'the identity is a proposal from desk capture');
select is((select count(*) from private.people_consents s
    join private.people_persons p on p.id = s.person_id
    where p.label = 'Hoa' and s.state = 'unknown'), 3::bigint, 'every store starts unknown');
select is((select count(*) from private.people_conversation_members m
    join private.people_persons p on p.id = m.person_id where p.label = 'Hoa'), 1::bigint,
  'the proposal is a member of the conversation');
select is(pg_temp.slot('evt-propose'), 'registry_write', 'a proposal takes the registry write slot');
select is(pg_temp.write('evt-propose-2', pg_temp.item('b1')) #>> '{items,0,result}', 'duplicate',
  'a second observation of the sender is a duplicate');
select is(pg_temp.people('Hoa'), 1::bigint, 'a duplicate proposes no second person');
select is(pg_temp.write('evt-propose', pg_temp.item('b1')) -> 'replayed', 'true'::jsonb,
  'a retry replays the proposal receipt');
select ok(private.people_recall('af100000-0000-4000-8000-000000000001', pg_temp.id('responder'),
    pg_temp.event('evt-recall'), 'group', jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('b1', 32))),
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('c1', 32))), null) -> 'personId' = 'null'::jsonb,
  'a proposed person is not recalled');

-- Rejection and suppression.
update private.people_channel_identities set link_state = 'rejected', decided_at = now()
  where lookup_hash = decode(repeat('b1', 32), 'hex');
select is(pg_temp.write('evt-rejected', pg_temp.item('b1')) #>> '{items,0,result}', 'duplicate',
  'a rejected sender is not proposed again');
insert into private.people_suppressions (ws_id, token, key_version)
  values ('af100000-0000-4000-8000-000000000001', decode(repeat('5d', 32), 'hex'), 1);
select is(pg_temp.write('evt-suppressed', pg_temp.item('d1'), 'd1') ->> 'reason', 'suppressed',
  'a suppressed sender is not proposed');
select is(pg_temp.people('Hoa') + (select count(*) from private.people_channel_identities
    where lookup_hash = decode(repeat('d1', 32), 'hex')), 1::bigint, 'a suppressed sender writes nothing');
select ok(exists (select 1 from private.people_audit_events
    where action = 'capture.propose' and reason_code = 'refused_suppressed'), 'suppression refusals are audited');
insert into private.people_suppressions (ws_id, token, key_version)
  values ('af100000-0000-4000-8000-000000000001', decode(repeat('77', 32), 'hex'), 1);
select is(pg_temp.write('evt-retired', jsonb_set(pg_temp.item('f1'), '{capture,checks}',
    jsonb_build_array(repeat('5f', 32), repeat('77', 32))), 'f1') ->> 'reason', 'suppressed',
  'a suppression stored under a retired key pair still fences the sender');
select throws_ok($$select pg_temp.write('evt-display-number',
  jsonb_set(pg_temp.item('e1'), '{capture,display}', '10'), 'e1')$$, '22023', null,
  'a display value must be a hex string');

-- Malformed capture material is refused before the event is consumed.
select throws_ok($$select pg_temp.write('evt-bad-person',
  jsonb_set(pg_temp.item('e1'), '{capture,personId}', '"not-a-uuid"'), 'e1')$$, '22023', null,
  'a malformed person ID is refused');
select throws_ok($$select pg_temp.write('evt-bad-lookup', pg_temp.item('e1'), 'e2')$$, '22023', null,
  'the capture lookup must be one of the sender lookups');
select throws_ok($$select pg_temp.write('evt-bad-token',
  jsonb_set(pg_temp.item('e1'), '{capture,checks}', jsonb_build_array(repeat('99', 32))), 'e1')$$, '22023', null,
  'the stored suppression token must be among the checks');
select throws_ok($$select pg_temp.write('evt-bad-key', pg_temp.item('e1') || '{"extra": 1}', 'e1')$$, '22023', null,
  'unknown item fields are refused');
select is(pg_temp.slot('evt-bad-person'), 'absent', 'malformed capture takes no slot');
select throws_ok($$select pg_temp.write('evt-long-label', pg_temp.item('e1', repeat('x', 201)), 'e1')$$, '22023',
  null, 'an overlong label is refused');

select * from finish();
rollback;
