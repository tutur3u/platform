begin;
select plan(36);

select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  where c.relnamespace = 'private'::regnamespace and c.relkind = 'r'
    and c.relname in ('people_principals', 'people_principal_keys', 'people_request_nonces',
      'people_request_counters', 'people_personal_recalls')
    and has_table_privilege(caller, c.oid, privilege)
), 'API roles have no direct principal table privileges');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname in (
    'people_register_principal', 'people_set_principal_key', 'people_revoke_principal',
    'people_principal_key', 'people_admit_request', 'people_record_personal_recall')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'client roles cannot execute principal functions');
select ok(not has_schema_privilege('people_registry_definer', 'private', 'CREATE'), 'definer role keeps no CREATE');

-- Fixtures.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ac000000-0000-4000-8000-000000000001', 'principal-owner@example.com', now(), '{}', '{}'),
  ('ac000000-0000-4000-8000-000000000002', 'principal-manager@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('ac100000-0000-4000-8000-000000000001', 'Principal tenant', 'ac000000-0000-4000-8000-000000000001', false);
select private.people_registry_enable('ac100000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001',
  jsonb_build_object('sender_lookup', encode(gen_random_bytes(60), 'base64'),
    'conversation_lookup', encode(gen_random_bytes(60), 'base64'), 'suppression', encode(gen_random_bytes(60), 'base64'),
    'display', encode(gen_random_bytes(60), 'base64'), 'audit', encode(gen_random_bytes(60), 'base64')));
select private.people_registry_set_manager('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', null, false);

-- Registration.
select throws_ok($$select private.people_register_principal('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'responder', 'desk', 'kid-manager-1', gen_random_bytes(32), null)$$,
  '42501', null, 'managers cannot register principals');
create temporary table people_test_principal as select (private.people_register_principal(
  'ac100000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'responder', 'Mira responder',
  'kid-responder-1', decode(repeat('ab', 32), 'hex'), 3) ->> 'principalId')::uuid as id;
select is(private.people_principal_key('kid-responder-1') ->> 'kind', 'responder', 'a registered key resolves');
select is((private.people_principal_key('kid-responder-1') ->> 'generation')::bigint, 1::bigint, 'it starts at generation 1');
select ok(private.people_principal_key('kid-unknown-1') is null, 'an unknown kid resolves to nothing');
select throws_ok($$select private.people_register_principal('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', 'responder', 'dup', 'kid-responder-1', gen_random_bytes(32), null)$$,
  '23505', null, 'a kid is globally unique');

-- Admission.
create function pg_temp.admit(p_nonce text, p_generation bigint default 1, p_at timestamptz default now(),
  p_kinds private.people_principal_kind[] default array['responder']::private.people_principal_kind[])
returns text language sql as $$
  select private.people_admit_request((select id from people_test_principal), 'kid-responder-1', p_generation,
    decode(p_nonce, 'hex'), p_at, p_kinds) ->> 'reason';
$$;
select is(pg_temp.admit(repeat('01', 16)), 'admitted', 'a fresh signed request is admitted');
select is(pg_temp.admit(repeat('01', 16)), 'nonce_replayed', 'a nonce is spent once');
select is(pg_temp.admit(repeat('02', 16), 1, now() - interval '6 minutes'), 'stale_request', 'an old request is refused');
select is(pg_temp.admit(repeat('03', 16), 1, now() + interval '2 minutes'), 'stale_request', 'a future request is refused');
select is(pg_temp.admit(repeat('04', 16), 2), 'principal_refused', 'a mismatched generation is refused');
select is(pg_temp.admit(repeat('05', 16), 1, now(), array['drain']::private.people_principal_kind[]),
  'principal_refused', 'a principal of another kind is refused');
select is(pg_temp.admit(repeat('06', 16)), 'admitted', 'a second request in the minute is admitted');
select is(pg_temp.admit(repeat('07', 16)), 'admitted', 'the third request reaches the limit');
select is(pg_temp.admit(repeat('08', 16)), 'rate_limited', 'the limit applies per minute');
select is(private.people_admit_request((select id from people_test_principal), 'kid-responder-1', null,
  decode(repeat('0a', 16), 'hex'), now(), array['responder']::private.people_principal_kind[]) ->> 'reason',
  'principal_refused', 'a missing generation is refused');
select is(private.people_admit_request((select id from people_test_principal), 'kid-responder-1', 1,
  decode(repeat('0b', 16), 'hex'), now(), null) ->> 'reason', 'principal_refused', 'a missing kind list is refused');
select is(private.people_admit_request((select id from people_test_principal), 'kid-responder-1', 1,
  decode(repeat('0c', 16), 'hex'), now(), array[null]::private.people_principal_kind[]) ->> 'reason',
  'principal_refused', 'a kind list of nulls is refused');

-- Keys and revocation.
select is(private.people_set_principal_key('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', (select id from people_test_principal), 'kid-responder-2',
  gen_random_bytes(32), false) ->> 'reason', 'updated', 'a rollover key is added');
select is(private.people_set_principal_key('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', (select id from people_test_principal), 'kid-responder-3',
  gen_random_bytes(32), false) ->> 'reason', 'too_many_keys', 'a principal keeps at most two live keys');
select is(pg_temp.admit(repeat('09', 16)), 'principal_refused', 'a key change bumps the generation');
select is(private.people_set_principal_key('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', (select id from people_test_principal), 'kid-responder-1', null, true)
  ->> 'reason', 'updated', 'revoking a live key bumps the generation once');
select is(private.people_set_principal_key('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', (select id from people_test_principal), 'kid-responder-1', null, true)
  ->> 'reason', 'unchanged', 'a repeated revoke changes nothing');
delete from private.people_request_counters where principal_id = (select id from people_test_principal);
select is(private.people_admit_request((select id from people_test_principal), 'kid-responder-2', 3,
  decode(repeat('0d', 16), 'hex'), now(), array['responder']::private.people_principal_kind[]) ->> 'reason',
  'admitted', 'the surviving key is admitted at the unchanged generation');
update private.people_registry_control set stopped = true where ws_id = 'ac100000-0000-4000-8000-000000000001';
select is(private.people_admit_request((select id from people_test_principal), 'kid-responder-2', 3,
  decode(repeat('0e', 16), 'hex'), now(), array['responder']::private.people_principal_kind[]) ->> 'reason',
  'principal_refused', 'a stopped registry admits nothing');
update private.people_registry_control set stopped = false where ws_id = 'ac100000-0000-4000-8000-000000000001';
update private.people_registry_control set stopped = true where ws_id = 'ac100000-0000-4000-8000-000000000001';
select ok(private.people_principal_key('kid-responder-1') is null, 'a stopped registry resolves no keys');
update private.people_registry_control set stopped = false where ws_id = 'ac100000-0000-4000-8000-000000000001';
select is(private.people_revoke_principal('ac100000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', (select id from people_test_principal)) ->> 'reason', 'revoked',
  'the owner revokes a principal');
select ok(private.people_principal_key('kid-responder-2') is null, 'a revoked principal resolves no keys');

-- Personal recalls.
select ok(not private.people_record_personal_recall('ac100000-0000-4000-8000-000000000001',
  decode(repeat('aa', 32), 'hex'), decode(repeat('bb', 32), 'hex')),
  'personal recalls are refused while the switch is off');
update private.people_registry_control set personal_sessions_enabled = true
  where ws_id = 'ac100000-0000-4000-8000-000000000001';
select ok(private.people_record_personal_recall('ac100000-0000-4000-8000-000000000001',
  decode(repeat('aa', 32), 'hex'), decode(repeat('bb', 32), 'hex')), 'a first recall is recorded');
select ok(not private.people_record_personal_recall('ac100000-0000-4000-8000-000000000001',
  decode(repeat('aa', 32), 'hex'), decode(repeat('bb', 32), 'hex')), 'a second recall of the same event is refused');
select ok(private.people_record_personal_recall('ac100000-0000-4000-8000-000000000001',
  decode(repeat('aa', 32), 'hex'), decode(repeat('cc', 32), 'hex')), 'another event of the same session is recorded');
update private.people_registry_control set stopped = true where ws_id = 'ac100000-0000-4000-8000-000000000001';
select ok(not private.people_record_personal_recall('ac100000-0000-4000-8000-000000000001',
  decode(repeat('aa', 32), 'hex'), decode(repeat('dd', 32), 'hex')), 'a stopped registry records no recall');
select is((select count(*) from private.people_personal_recalls
  where ws_id = 'ac100000-0000-4000-8000-000000000001'), 2::bigint, 'refused recalls write nothing');

select * from finish();
rollback;
