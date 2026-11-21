begin;
select plan(37);

select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  where has_table_privilege(caller, 'private.people_memory_ledger', privilege)
), 'API roles have no direct ledger privileges');
select ok(not has_function_privilege('service_role', 'private.people_memory_consent_granted(uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.people_ledger_writer(uuid, uuid, bigint, uuid, boolean)', 'EXECUTE'),
  'ledger helpers are internal');
select ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname in (
    'people_memory_consent_granted', 'people_ledger_writer', 'people_reserve_memory', 'people_settle_memory',
    'people_deletion_ledger', 'people_finish_delete')
    and pg_get_userbyid(p.proowner) <> 'people_registry_definer'
), 'ledger routines are owned by people_registry_definer');

-- Fixtures: a tenant with an owner, a manager, three people and one group chat.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ad000000-0000-4000-8000-000000000001', 'ledger-owner@example.com', now(), '{}', '{}'),
  ('ad000000-0000-4000-8000-000000000002', 'ledger-manager@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('ad100000-0000-4000-8000-000000000001', 'Ledger tenant', 'ad000000-0000-4000-8000-000000000001', false);
select private.people_registry_enable('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  jsonb_build_object('sender_lookup', encode(gen_random_bytes(60), 'base64'),
    'conversation_lookup', encode(gen_random_bytes(60), 'base64'), 'suppression', encode(gen_random_bytes(60), 'base64'),
    'display', encode(gen_random_bytes(60), 'base64'), 'audit', encode(gen_random_bytes(60), 'base64')));
select private.people_registry_set_manager('ad100000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002', null, false);
create temporary table ledger_ids as select
  private.people_create_person('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'person', 'Ledger person', false) as person_a,
  private.people_create_person('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'person', 'Group member', false) as person_b,
  (private.people_register_principal('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'responder', 'Responder', 'kid-ledger-responder', gen_random_bytes(32), null) ->> 'principalId')::uuid as responder,
  (private.people_register_principal('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'responder', 'Other responder', 'kid-ledger-other', gen_random_bytes(32), null) ->> 'principalId')::uuid as other,
  (private.people_register_principal('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    'drain', 'Drain', 'kid-ledger-drain', gen_random_bytes(32), null) ->> 'principalId')::uuid as drain;
insert into private.people_conversations (id, ws_id, channel, provider_account_id, lookup_hash, key_version, kind) values
  ('ad200000-0000-4000-8000-000000000001', 'ad100000-0000-4000-8000-000000000001', 'zalo', 'oa-ledger',
    decode(repeat('c1', 32), 'hex'), 1, 'group'),
  ('ad200000-0000-4000-8000-000000000002', 'ad100000-0000-4000-8000-000000000001', 'zalo', 'oa-ledger',
    decode(repeat('c2', 32), 'hex'), 1, 'group');
insert into private.people_channel_identities (id, ws_id, person_id, channel, provider_account_id, lookup_hash, key_version,
  suppression_token, suppression_key_version, verification, link_state, basis, decided_at) values
  ('ad300000-0000-4000-8000-000000000001', 'ad100000-0000-4000-8000-000000000001', (select person_b from ledger_ids),
    'zalo', 'oa-ledger', decode(repeat('d1', 32), 'hex'), 1, decode(repeat('e1', 32), 'hex'), 1,
    'desk_observed', 'confirmed', 'owner_statement', now()),
  ('ad300000-0000-4000-8000-000000000002', 'ad100000-0000-4000-8000-000000000001', (select person_a from ledger_ids),
    'zalo', 'oa-ledger', decode(repeat('d2', 32), 'hex'), 1, decode(repeat('e2', 32), 'hex'), 1,
    'desk_observed', 'confirmed', 'owner_statement', now());
insert into private.people_conversation_members (ws_id, conversation_id, person_id, identity_id) values
  ('ad100000-0000-4000-8000-000000000001', 'ad200000-0000-4000-8000-000000000001',
    (select person_b from ledger_ids), 'ad300000-0000-4000-8000-000000000001'),
  ('ad100000-0000-4000-8000-000000000001', 'ad200000-0000-4000-8000-000000000001',
    (select person_a from ledger_ids), 'ad300000-0000-4000-8000-000000000002');

create function pg_temp.reserve(p_key text, p_principal uuid, p_actor uuid, p_person uuid,
  p_conversation uuid default null, p_origin uuid default null, p_generation bigint default 1)
returns jsonb language sql as $$
  select private.people_reserve_memory('ad100000-0000-4000-8000-000000000001', p_principal,
    case when p_principal is null then null else p_generation end, p_actor, p_person,
    p_conversation, 'fact', null, null, decode(p_key, 'hex'), p_origin, '{"source":"test"}');
$$;
create function pg_temp.grant_memory(p_person uuid, p_conversation uuid default null, p_expires timestamptz default null)
returns void language sql as $$
  select private.people_set_consent('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
    p_person, p_conversation, 'memory', 'granted', 'owner_attested', '{"note":"attested for tests"}', '{}', p_expires);
$$;
create function pg_temp.settle(p_ledger uuid, p_state private.people_memory_state, p_memory text default null,
  p_revision text default null, p_base text default null, p_principal uuid default null, p_actor uuid default null)
returns text language sql as $$
  select private.people_settle_memory('ad100000-0000-4000-8000-000000000001', p_principal,
    case when p_principal is null then null else 1 end, p_actor, p_ledger, p_state, p_memory, p_revision, p_base) ->> 'reason';
$$;

-- Authority, consent and idempotency.
select is(pg_temp.reserve(repeat('01', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids))
  ->> 'reason', 'consent_required', 'unknown memory consent refuses a reservation');
select pg_temp.grant_memory((select person_a from ledger_ids));
create temporary table ledger_rows as select (pg_temp.reserve(repeat('02', 32), (select responder from ledger_ids), null,
  (select person_a from ledger_ids)) ->> 'ledgerId')::uuid as first;
select ok((select first from ledger_rows) is not null, 'granted consent admits a reservation');
select is(pg_temp.reserve(repeat('02', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids))
  ->> 'ledgerId', (select first::text from ledger_rows), 'a replay returns the existing row');
select is(pg_temp.reserve(repeat('02', 32), (select other from ledger_ids), null, (select person_a from ledger_ids))
  ->> 'reason', 'idempotency_conflict', 'a replay from another writer is refused');
select throws_ok($$select pg_temp.reserve(repeat('03', 32), (select drain from ledger_ids), null, (select person_a from ledger_ids))$$,
  '42501', null, 'a drain principal cannot write memories');
select throws_ok($$select pg_temp.reserve(repeat('03', 32), (select responder from ledger_ids), null,
  (select person_a from ledger_ids), null, null, 7)$$, '42501', null, 'a stale principal generation is refused');
select is(pg_temp.reserve(repeat('04', 32), null, 'ad000000-0000-4000-8000-000000000002', (select person_a from ledger_ids))
  ->> 'reason', 'reserved', 'a manager can write memories');
select pg_temp.grant_memory((select person_b from ledger_ids), null, now() - interval '1 minute');
select is(pg_temp.reserve(repeat('05', 32), (select responder from ledger_ids), null, (select person_b from ledger_ids))
  ->> 'reason', 'consent_required', 'expired consent refuses a reservation');

-- Audience origin.
select is(pg_temp.reserve(repeat('06', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids),
  null, 'ad200000-0000-4000-8000-000000000002') ->> 'reason', 'scope_denied',
  'a person memory cannot claim a conversation the person is not in');
select is(pg_temp.reserve(repeat('07', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids),
  null, 'ad200000-0000-4000-8000-000000000001') ->> 'reason', 'reserved', 'a member conversation is a valid origin');
select pg_temp.grant_memory(null, 'ad200000-0000-4000-8000-000000000001');
select is(pg_temp.reserve(repeat('08', 32), (select responder from ledger_ids), null, null,
  'ad200000-0000-4000-8000-000000000001', 'ad200000-0000-4000-8000-000000000002') ->> 'reason', 'scope_denied',
  'a conversation memory originates in its own conversation');

-- Conversation members.
select is(pg_temp.reserve(repeat('09', 32), (select responder from ledger_ids), null, null,
  'ad200000-0000-4000-8000-000000000001') ->> 'reason', 'consent_required',
  'a member without usable consent blocks a group memory');
select pg_temp.grant_memory((select person_b from ledger_ids));
select is(pg_temp.reserve(repeat('0a', 32), (select responder from ledger_ids), null, null,
  'ad200000-0000-4000-8000-000000000001') ->> 'reason', 'reserved', 'a group memory is admitted once every member consents');

-- Settlement.
select is(pg_temp.settle((select first from ledger_rows), 'active', null, null, null, (select responder from ledger_ids)), 'invalid_transition',
  'activation needs the service memory ID');
select throws_ok($$select pg_temp.settle((select first from ledger_rows), 'active', 'mem-1', 'rev-1', null,
  (select other from ledger_ids))$$, '42501', null, 'another principal cannot settle the row');
select is(pg_temp.settle((select first from ledger_rows), 'active', 'mem-1', 'rev-1', null, (select responder from ledger_ids)),
  'settled', 'the writer records its confirmed write');
select is(pg_temp.settle((select first from ledger_rows), 'retained', 'mem-other', null, null, null,
  'ad000000-0000-4000-8000-000000000002'), 'memory_mismatch', 'the memory ID never changes');
select is(pg_temp.settle((select first from ledger_rows), 'forgotten', null, null, 'rev-0', null,
  'ad000000-0000-4000-8000-000000000002'), 'revision_conflict', 'a stale revision cannot forget');
select is(pg_temp.settle((select first from ledger_rows), 'forgotten', null, null, 'rev-1', null,
  'ad000000-0000-4000-8000-000000000002'), 'settled', 'a manager forgets with the current revision');
select is(pg_temp.settle((select first from ledger_rows), 'active', 'mem-1', null, null, null,
  'ad000000-0000-4000-8000-000000000002'), 'invalid_transition', 'a forgotten row never comes back');
select throws_ok($$select pg_temp.settle((select first from ledger_rows), 'purged', null, null, null, null,
  'ad000000-0000-4000-8000-000000000002')$$, '42501', null, 'only the owner purges');

-- A pending write whose purge fails is recorded as retained without a memory ID.
create temporary table ledger_pending as select (pg_temp.reserve(repeat('0b', 32), (select responder from ledger_ids),
  null, (select person_a from ledger_ids)) ->> 'ledgerId')::uuid as id;
select is(pg_temp.settle((select id from ledger_pending), 'retained', null, null, null, (select responder from ledger_ids)),
  'settled', 'a failed pending write can be retained without a memory ID');

-- Deletion fences every writer and waits for every purge.
select private.people_begin_delete('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  (select person_a from ledger_ids), false);
select is(pg_temp.reserve(repeat('0c', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids))
  ->> 'reason', 'deleting', 'a deleting person admits no new memories');
select is(pg_temp.reserve(repeat('02', 32), (select responder from ledger_ids), null, (select person_a from ledger_ids))
  ->> 'reason', 'deleting', 'a replay is rechecked against the fence');
select is(pg_temp.reserve(repeat('0d', 32), (select responder from ledger_ids), null, null,
  'ad200000-0000-4000-8000-000000000001') ->> 'reason', 'consent_required', 'a deleting member blocks a group memory');
create temporary table ledger_late as select l.id from private.people_memory_ledger l
  where l.person_id = (select person_a from ledger_ids) and l.state = 'pending' and l.writer_actor is not null;
select is(pg_temp.settle((select id from ledger_late), 'active', 'mem-late', null, null, null,
  'ad000000-0000-4000-8000-000000000002'), 'deleting', 'a write that lands after the fence is not activated');
select is(jsonb_array_length(private.people_deletion_ledger('ad100000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001', (select person_a from ledger_ids))), 4,
  'the deletion ledger lists every unpurged row, pending ones included');
select is(private.people_finish_delete('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  (select person_a from ledger_ids)) ->> 'reason', 'retained', 'deletion cannot finish with unpurged memories');
select is((select count(*) from private.people_memory_ledger l, lateral (select pg_temp.settle(l.id, 'purged', null, null,
  null, null, 'ad000000-0000-4000-8000-000000000001') as reason) r
  where l.person_id = (select person_a from ledger_ids) and l.state <> 'purged' and r.reason = 'settled'), 4::bigint,
  'the owner purges each row through settlement');
select is(private.people_finish_delete('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  (select person_a from ledger_ids)) ->> 'reason', 'deleted', 'deletion finishes once every memory is purged');
select ok(not exists (select 1 from private.people_memory_ledger where person_id = (select person_a from ledger_ids)),
  'finished deletion removes the ledger rows');

-- Cascades never drop unpurged rows.
select throws_ok($$delete from private.people_conversations where id = 'ad200000-0000-4000-8000-000000000001'$$,
  '23503', null, 'a conversation with ledger rows cannot be removed');
select throws_ok($$delete from private.people_registry_control where ws_id = 'ad100000-0000-4000-8000-000000000001'$$,
  '23503', null, 'a workspace registry with ledger rows cannot be removed');
select ok((select prosecdef from pg_proc where oid = 'private.people_finish_delete(uuid, uuid, uuid)'::regprocedure),
  'finish_delete stays a definer after its redefinition');

select * from finish();
rollback;
