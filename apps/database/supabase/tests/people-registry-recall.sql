begin;
select plan(61);

-- Grants.
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_recall', 'people_list_changes', 'people_admit_event', 'people_valid_lookups',
      'fleet_is_desk_account', 'people_machine_lookup_keys', 'people_profile_granted', 'people_brief_usable',
      'people_emit_change')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'client roles cannot execute recall functions');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_admit_event', 'people_valid_lookups', 'fleet_is_desk_account',
      'people_profile_granted', 'people_brief_usable')
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'the service role cannot call the internal helpers');
select ok(has_function_privilege('service_role',
  'private.people_recall(uuid, uuid, jsonb, text, jsonb, jsonb, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.people_list_changes(uuid, uuid, bigint, integer)', 'EXECUTE'),
  'the service role calls recall and the change feed');
select ok(not has_function_privilege('people_registry_definer', 'private.fleet_consume_provider_event(jsonb)', 'EXECUTE'),
  'the registry definer cannot take the Fleet slot');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'private'::regnamespace
    and p.proname in ('people_recall', 'people_list_changes', 'people_admit_event', 'people_valid_lookups',
      'people_machine_lookup_keys', 'people_profile_granted', 'people_brief_usable', 'people_emit_change')
    and p.proowner = 'people_registry_definer'::regrole
    and p.proconfig @> array['search_path=pg_catalog, pg_temp']), 8,
  'registry recall functions belong to the definer role with a pinned search path');
select ok(not has_schema_privilege('people_registry_definer', 'private', 'CREATE'), 'definer role keeps no CREATE');

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ad000000-0000-4000-8000-000000000001', 'recall-owner@example.com', now(), '{}', '{}'),
  ('ad000000-0000-4000-8000-000000000002', 'recall-other@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal) values
  ('ad100000-0000-4000-8000-000000000001', 'Recall tenant', 'ad000000-0000-4000-8000-000000000001', false),
  ('ad100000-0000-4000-8000-000000000002', 'Other tenant', 'ad000000-0000-4000-8000-000000000002', false);
create function pg_temp.keys() returns jsonb language sql as $$
  select jsonb_build_object('sender_lookup', encode(gen_random_bytes(60), 'base64'),
    'conversation_lookup', encode(gen_random_bytes(60), 'base64'), 'suppression', encode(gen_random_bytes(60), 'base64'),
    'display', encode(gen_random_bytes(60), 'base64'), 'audit', encode(gen_random_bytes(60), 'base64'));
$$;
select private.people_registry_enable('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.keys());
select private.people_registry_enable('ad100000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000002',
  pg_temp.keys());
select private.people_registry_set_binding('ad100000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001', 'zalo', 'recall-acct', false);
select private.people_registry_set_binding('ad100000-0000-4000-8000-000000000002',
  'ad000000-0000-4000-8000-000000000002', 'zalo', 'recall-acct-other', false);
-- A Fleet desk account bound behind the API's back is still refused.
insert into private.fleet_desk_owners
  (channel, provider_account_id, provider_account_label, desk_id, credential_version, quiesced)
  values ('zalo', 'recall-desk', 'Recall desk', 'desk-recall', 1, false);
insert into private.people_channel_bindings (channel, provider_account_id, ws_id, added_by)
  values ('zalo', 'recall-desk', 'ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001');

create temporary table people_test_ids (name text primary key, id uuid not null);
create function pg_temp.id(p_name text) returns uuid language sql as $$
  select id from people_test_ids where name = p_name;
$$;
create function pg_temp.principal(p_ws uuid, p_actor uuid, p_kind private.people_principal_kind, p_kid text)
returns uuid language sql as $$
  select (private.people_register_principal(p_ws, p_actor, p_kind, p_kid, p_kid, gen_random_bytes(32), 600)
    ->> 'principalId')::uuid;
$$;
insert into people_test_ids values
  ('responder', pg_temp.principal('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'responder', 'kid-recall-responder')),
  ('drain', pg_temp.principal('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'drain', 'kid-recall-drain')),
  ('other', pg_temp.principal('ad100000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000002',
    'responder', 'kid-recall-other')),
  ('owner', private.people_create_person('ad100000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'person', 'Owner', true)),
  ('lan', private.people_create_person('ad100000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'person', 'Lan', false));
insert into private.people_channel_identities (ws_id, person_id, channel, provider_account_id, lookup_hash,
  key_version, suppression_token, suppression_key_version, verification, link_state, basis, decided_at)
  values ('ad100000-0000-4000-8000-000000000001', pg_temp.id('lan'), 'zalo', 'recall-acct',
    decode(repeat('a1', 32), 'hex'), 1, gen_random_bytes(32), 1, 'asserted', 'confirmed', 'owner_statement', now());
insert into private.people_conversations (ws_id, channel, provider_account_id, lookup_hash, key_version, kind) values
  ('ad100000-0000-4000-8000-000000000001', 'zalo', 'recall-acct', decode(repeat('c1', 32), 'hex'), 1, 'dm'),
  ('ad100000-0000-4000-8000-000000000001', 'zalo', 'recall-acct', decode(repeat('c2', 32), 'hex'), 1, 'group');
insert into people_test_ids select 'group', c.id from private.people_conversations c
  where c.ws_id = 'ad100000-0000-4000-8000-000000000001' and c.kind = 'group';

select private.people_set_fact('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), 'preferred_name', 'chị Lan', null, 'subject_conversations', null, false, false);
select private.people_set_fact('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), 'role', 'accountant', null, 'subject_conversations', null, false, false);
select private.people_set_fact('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), 'project', 'Q4 close', null, 'listed', array[pg_temp.id('group')], false, false);
select private.people_set_rule('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'channel_default', 'zalo', null, null, 'reply_mode', '"auto"', null, null, false);
select private.people_set_rule('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'person', null, pg_temp.id('lan'), null, 'initiate', '"never"', null, null, false);
select private.people_set_relationship('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('owner'), pg_temp.id('lan'), 'colleague', null, 1, false);

create function pg_temp.event(p_id text, p_account text default 'recall-acct') returns jsonb language sql as $$
  select jsonb_build_object('channel', 'zalo', 'account', p_account,
    'eventHash', encode(sha256(convert_to(p_id, 'UTF8')), 'hex'));
$$;
create function pg_temp.recall(
  p_id text, p_account text default 'recall-acct', p_type text default 'private_1_to_1',
  p_conversation text default 'c1', p_if text default null, p_principal text default 'responder',
  p_ws uuid default 'ad100000-0000-4000-8000-000000000001'
) returns jsonb language sql as $$
  select private.people_recall(p_ws, pg_temp.id(p_principal), pg_temp.event(p_id, p_account), p_type,
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat('a1', 32))),
    jsonb_build_array(jsonb_build_object('version', 1, 'hash', repeat(p_conversation, 32))), p_if);
$$;
create function pg_temp.slot(p_id text, p_account text default 'recall-acct') returns text language sql as $$
  select coalesce((select coalesce(e.exclusive_slot, 'none') || ':' || (e.recall_consumed_at is not null)::text
    from private.fleet_provider_events e
    where e.channel = 'zalo' and e.provider_account_id = p_account
      and e.event_hash = sha256(convert_to(p_id, 'UTF8'))), 'absent');
$$;
create temporary table people_test_fleet_identities as
  select count(*) as n from private.fleet_channel_identities;

-- Unknown consent: owner-entered addressing facts and every rule only.
create temporary table people_test_recall as select pg_temp.recall('evt-unknown') as r;
select is((select r ->> 'personId' from people_test_recall)::uuid, pg_temp.id('lan'),
  'the sender resolves from the evidence lookup hash');
select is((select r #>> '{snapshot,consent}' from people_test_recall), 'unknown', 'a missing consent row is unknown');
select ok((select r #> '{snapshot,person}' = 'null'::jsonb from people_test_recall),
  'the label needs granted consent');
select is((select r #> '{snapshot,facts}' from people_test_recall),
  '[{"key": "preferred_name", "value": "chị Lan"}]'::jsonb, 'unknown consent returns the addressing facts only');
select is((select jsonb_array_length(r #> '{snapshot,rules}') from people_test_recall), 2,
  'channel default and person rules apply under unknown consent');
select is((select r #> '{snapshot,relationships}' from people_test_recall), '[]'::jsonb,
  'relationships need granted consent');
select is((select r #>> '{snapshot,conversation,kind}' from people_test_recall), 'dm', 'the DM resolves');
select is(pg_temp.slot('evt-unknown'), 'none:true', 'a recall takes only the recall slot');

-- Granted consent.
select private.people_set_consent('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), null, 'profile', 'granted', 'owner_attested', '{"note": "agreed in person"}', null, null);
delete from people_test_recall;
insert into people_test_recall select pg_temp.recall('evt-granted');
select is((select r #>> '{snapshot,person,label}' from people_test_recall), 'Lan', 'granted consent returns the label');
select is((select jsonb_array_length(r #> '{snapshot,facts}') from people_test_recall), 2,
  'granted consent returns the facts whose audience covers the DM');
select is((select r #> '{snapshot,relationships}' from people_test_recall),
  '[{"kind": "colleague", "label": null, "direction": "from_owner"}]'::jsonb, 'the relationship to the owner is returned');
select is((select r #>> '{versions,person,consentVersion}' from people_test_recall)::bigint,
  (select consent_version from private.people_persons where id = pg_temp.id('lan')), 'versions report the consent version');

-- Revalidation.
select is(pg_temp.recall('evt-revalidate', p_if => (select r ->> 'etag' from people_test_recall)) -> 'notModified',
  'true'::jsonb, 'an unchanged snapshot is not modified');
select private.people_set_fact('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), 'role', 'controller', 1, null, null, null, false);
select ok(not (pg_temp.recall('evt-revalidate-2', p_if => (select r ->> 'etag' from people_test_recall)) ? 'notModified'),
  'a fact change invalidates the etag');
update private.people_rules set expires_at = clock_timestamp() + interval '1 hour'
  where person_id = pg_temp.id('lan');
delete from people_test_recall;
insert into people_test_recall select pg_temp.recall('evt-expiry');
update private.people_rules set expires_at = clock_timestamp() - interval '1 second'
  where person_id = pg_temp.id('lan');
select ok(not (pg_temp.recall('evt-expired', p_if => (select r ->> 'etag' from people_test_recall)) ? 'notModified'),
  'a rule expiry changes the etag');
select is(jsonb_array_length(pg_temp.recall('evt-expired-2') #> '{snapshot,rules}'), 1, 'an expired rule stops applying');

-- Group conversations.
delete from people_test_recall;
insert into people_test_recall select pg_temp.recall('evt-group', p_type => 'group', p_conversation => 'c2');
select is((select r ->> 'conversationId' from people_test_recall)::uuid, pg_temp.id('group'), 'the group resolves');
select ok((select r #> '{snapshot,facts}' @> '[{"key": "project"}]' from people_test_recall),
  'a listed fact applies in its listed group');
select ok(not (pg_temp.recall('evt-dm-listed') #> '{snapshot,facts}' @> '[{"key": "project"}]'),
  'a listed fact stays out of other conversations');
select ok(pg_temp.recall('evt-group-kind', p_type => 'group', p_conversation => 'c1') -> 'conversationId' = 'null'::jsonb,
  'a DM hash does not resolve as a group');
select ok(not (select r #> '{snapshot,facts}' @> '[{"key": "role"}]' from people_test_recall),
  'a subject fact needs a membership row in a group');
select is(pg_temp.recall('evt-unresolved', p_conversation => 'c9') #> '{snapshot,facts}',
  '[{"key": "preferred_name", "value": "chị Lan"}]'::jsonb,
  'an unresolved conversation gets the addressing facts only');
insert into private.people_conversation_members (ws_id, conversation_id, person_id, identity_id)
  select i.ws_id, pg_temp.id('group'), i.person_id, i.id from private.people_channel_identities i
  where i.person_id = pg_temp.id('lan');
select private.people_set_consent('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  null, pg_temp.id('group'), 'profile', 'granted', 'owner_attested', '{"note": "team chat"}', null, null);
insert into private.people_briefs (ws_id, conversation_id, body, cited_ids, consent_version)
  select c.ws_id, c.id, 'Month-end close group', array[(select f.id from private.people_facts f
    where f.person_id = pg_temp.id('lan') and f.key = 'project')], c.consent_version
  from private.people_conversations c where c.id = pg_temp.id('group');
delete from people_test_recall;
insert into people_test_recall select pg_temp.recall('evt-group-member', p_type => 'group', p_conversation => 'c2');
select ok((select r #> '{snapshot,facts}' @> '[{"key": "role"}]' from people_test_recall),
  'a subject fact applies in a group the person is a member of');
select is((select r #>> '{snapshot,conversation,brief}' from people_test_recall), 'Month-end close group',
  'a group brief applies while every member keeps a granted profile');
select is(pg_temp.slot('evt-group'), 'none:true', 'a group recall never takes the Fleet slot');
select is((select count(*) from private.fleet_channel_identities), (select n from people_test_fleet_identities),
  'recall never touches Fleet channel identities');

-- Event admission order: the binding check precedes consumption.
select is(pg_temp.recall('evt-replay') ->> 'reason', 'ok', 'the first recall for an event is answered');
select is(pg_temp.recall('evt-replay') ->> 'reason', 'event_consumed', 'a second recall for the event is refused');
select is(pg_temp.recall('evt-unbound', 'recall-unbound') ->> 'reason', 'scope_denied', 'an unbound account is refused');
select is(pg_temp.slot('evt-unbound', 'recall-unbound'), 'absent', 'a refused unbound event takes no slot');
select is(private.fleet_consume_provider_event(pg_temp.event('evt-unbound', 'recall-unbound')), true,
  'the Fleet slot stays free after an unbound refusal');
select is(pg_temp.recall('evt-elsewhere', 'recall-acct-other') ->> 'reason', 'scope_denied',
  'an account bound to another workspace is refused');
select is(pg_temp.slot('evt-elsewhere', 'recall-acct-other'), 'absent', 'a cross-tenant refusal takes no slot');
select is(pg_temp.recall('evt-desk', 'recall-desk') ->> 'reason', 'scope_denied', 'a Fleet desk account is refused');
select is(pg_temp.slot('evt-desk', 'recall-desk'), 'absent', 'a desk refusal takes no slot');
select is(private.fleet_consume_provider_event(pg_temp.event('evt-desk', 'recall-desk')), true,
  'the desk event stays available to Fleet');
select ok(exists (select 1 from private.people_audit_events a
    where a.principal_id = pg_temp.id('responder') and a.action = 'event.admit' and a.reason_code = 'refused_scope'),
  'scope refusals are audited by principal');

-- Principals.
select is(pg_temp.recall('evt-tenant', p_principal => 'other') ->> 'reason', 'principal_refused',
  'another tenant principal cannot recall this workspace');
select is(pg_temp.slot('evt-tenant'), 'absent', 'a principal refusal takes no slot');
select is(pg_temp.recall('evt-drain', p_principal => 'drain') ->> 'reason', 'principal_refused',
  'a drain principal cannot recall');
select throws_ok($$select private.people_recall('ad100000-0000-4000-8000-000000000001', pg_temp.id('responder'),
  pg_temp.event('evt-bad'), 'private_1_to_1', '[]', '[{"version": 1, "hash": "00"}]', null)$$,
  '22023', null, 'malformed lookups are refused');

-- Consent withdrawal.
select private.people_set_consent('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  pg_temp.id('lan'), null, 'profile', 'denied', 'owner_attested', '{"note": "asked to stop"}', null, null);
delete from people_test_recall;
insert into people_test_recall select pg_temp.recall('evt-denied');
select is((select r #> '{snapshot,facts}' from people_test_recall), '[]'::jsonb,
  'denied consent withholds even owner-entered facts');
select ok((select r #> '{snapshot,rules}' @> '[{"scope": "channel_default"}]' from people_test_recall),
  'rules still apply under denied consent');
select ok(pg_temp.recall('evt-group-denied', p_type => 'group', p_conversation => 'c2')
    #> '{snapshot,conversation,brief}' = 'null'::jsonb,
  'a group brief is withheld once a member denies profile consent');
update private.people_consents set state = 'granted', expires_at = clock_timestamp() - interval '1 second'
  where person_id = pg_temp.id('lan') and store = 'profile';
select is(pg_temp.recall('evt-expired-consent') #>> '{snapshot,consent}', 'expired', 'a lapsed grant is expired');

-- Lookup keys.
select is((select array_agg(distinct e ->> 'purpose' order by e ->> 'purpose')
    from jsonb_array_elements(private.people_machine_lookup_keys('ad100000-0000-4000-8000-000000000001',
      pg_temp.id('responder'))) e), array['conversation_lookup', 'sender_lookup'],
  'a responder receives only the lookup keys');
select is(private.people_machine_lookup_keys('ad100000-0000-4000-8000-000000000001', pg_temp.id('drain')),
  '[]'::jsonb, 'a drain principal receives no keys');
select is(private.people_machine_lookup_keys('ad100000-0000-4000-8000-000000000001', pg_temp.id('other')),
  '[]'::jsonb, 'another tenant principal receives no keys');

-- Change feed.
select ok(jsonb_array_length(private.people_list_changes('ad100000-0000-4000-8000-000000000001', pg_temp.id('drain'),
  0, 500) -> 'events') > 0, 'a drain principal reads change events');
select is(private.people_list_changes('ad100000-0000-4000-8000-000000000001', pg_temp.id('drain'), 0, 1)
  #>> '{events,0,eventId}', '1', 'the cursor is the workspace sequence, not the global event identity');
select is((select max(ws_seq) from private.people_change_events where ws_id = 'ad100000-0000-4000-8000-000000000001'),
  (select count(*) from private.people_change_events where ws_id = 'ad100000-0000-4000-8000-000000000001'),
  'the workspace sequence has no gaps');
select is((select last_seq from private.people_change_sequences where ws_id = 'ad100000-0000-4000-8000-000000000001'),
  (select max(ws_seq) from private.people_change_events where ws_id = 'ad100000-0000-4000-8000-000000000001'),
  'the sequence row tracks the last event');
select is((private.people_list_changes('ad100000-0000-4000-8000-000000000001', pg_temp.id('drain'),
  (select max(ws_seq) from private.people_change_events where ws_id = 'ad100000-0000-4000-8000-000000000001'), 10)
  -> 'events'), '[]'::jsonb, 'the cursor excludes events it has read');
select is(private.people_list_changes('ad100000-0000-4000-8000-000000000001', pg_temp.id('responder'), 0, 10)
  ->> 'reason', 'principal_refused', 'only drain principals read changes');

-- Stop flag.
update private.people_registry_control set stopped = true where ws_id = 'ad100000-0000-4000-8000-000000000001';
select is(pg_temp.recall('evt-stopped') ->> 'reason', 'principal_refused', 'a stopped registry answers nothing');

select * from finish();
rollback;
