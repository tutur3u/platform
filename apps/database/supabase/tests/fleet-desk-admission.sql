begin;
-- 55 single-row assertions, plus row-per-case matrices: 45 mismatches,
-- 3 quiesced operations and 9 stale-credential operations.
select plan(112);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('fe000000-0000-4000-8000-000000000001', 'fleet-desk-owner@example.com', now(), '{}', '{}'),
  ('fe000000-0000-4000-8000-000000000002', 'fleet-desk-reader@example.com', now(), '{}', '{}'),
  ('fe000000-0000-4000-8000-000000000003', 'fleet-desk-observer@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('00000000-0000-0000-0000-000000000000', 'Fleet SQL root',
    'fe000000-0000-4000-8000-000000000001', false)
  on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type)
  values ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-4000-8000-000000000001', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;

update private.fleet_control set owner_user_id = 'fe000000-0000-4000-8000-000000000001';

create function pg_temp.fixture_owner()
returns text language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"fe000000-0000-4000-8000-000000000001"}', true)
$$;

create function pg_temp.as_service()
returns text language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true)
$$;

select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname in (
    'fleet_register_desk_owner', 'fleet_quiesce_desk_owner', 'fleet_resume_desk_owner',
    'fleet_rotate_desk_credential', 'fleet_promote_desk_owner', 'fleet_rollback_desk_owner',
    'fleet_change_desk_owner', 'fleet_check_desk_owner', 'fleet_admit_desk_event',
    'fleet_linked_desk_actor', 'fleet_question_usage', 'fleet_digest_sections'
  ) and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'no API role can execute owner changes or admission internals');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname like 'fleet_%desk%'
    and p.proname <> 'fleet_read_desk_digest'
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and a.grantee = case caller when 'public' then 0 else caller::regrole::oid end)
), 'desk owner functions carry no PUBLIC or client ACL entries');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace
    and (p.proname like 'fleet_%desk%' or p.proname in ('fleet_question_usage', 'fleet_digest_sections'))
    and coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=pg_catalog, pg_temp'
), 'desk functions pin search_path to pg_catalog, pg_temp');
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['private.fleet_desk_owners', 'private.fleet_desk_credentials']) as t(name)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privilege
  where has_table_privilege(caller, t.name, privilege)
), 'no API role can read or write desk owner state directly');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('private.fleet_desk_owners'::regclass, 'private.fleet_desk_credentials'::regclass)),
  'desk owner tables have RLS enabled');
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated']) as caller
  where has_function_privilege(caller, 'private.fleet_read_desk_digest(jsonb)', 'EXECUTE')
), 'desk digest entry point is server only');

select pg_temp.fixture_owner();
select throws_ok(
  $$select private.fleet_register_desk_owner('zalo', 'account', 'Ops', 'm4', 1)$$,
  '42501', 'Fleet Owner access required', 'configured UUID without live permission cannot register'
);
select set_config('request.jwt.claims', '{}', true);
select private.grant_mastermind_access('fe000000-0000-4000-8000-000000000001', 'Fleet desk SQL fixture');
select throws_ok(
  $$select private.fleet_register_desk_owner('zalo', 'account', 'Ops', 'm4', 1)$$,
  '42501', 'Fleet Owner access required', 'a database connection needs verified Owner request identity'
);
select set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"fe000000-0000-4000-8000-000000000002"}', true);
select throws_ok(
  $$select private.fleet_register_desk_owner('zalo', 'account', 'Ops', 'm4', 1)$$,
  '42501', 'Fleet Owner access required', 'wrong request identity cannot register'
);
select pg_temp.as_service();
select throws_ok(
  $$select private.fleet_change_desk_owner('fe000000-0000-4000-8000-000000000001',
    'zalo', 'account', 'resume', 1)$$,
  '55000', 'Fleet desk owner generation changed',
  'the internal change helper never creates an owner'
);

select pg_temp.fixture_owner();
select is(private.fleet_register_desk_owner('zalo', 'account', ' Ops ', 'm4', 1),
  '{"account":"account","deskId":"m4","ownerGeneration":"1","credentialVersion":1,"quiesced":true}'::jsonb,
  'registration starts quiesced at generation one');
select is((select provider_account_label from private.fleet_desk_owners where provider_account_id = 'account'),
  'Ops', 'registration trims the display label');
select throws_ok(
  $$select private.fleet_register_desk_owner('zalo', 'account', 'Ops', 'm5', 1)$$,
  '23505', null, 'an account has one owner row'
);
select throws_ok(
  $$select private.fleet_register_desk_owner('zalo', 'other', 'Ops', 'm4', 2)$$,
  '23505', null, 'a desk owns one provider account at a time'
);
select throws_like($$delete from private.fleet_desk_owners$$, '%', 'owner row cannot be deleted');
select throws_like($$truncate private.fleet_desk_owners$$, '%', 'owner table cannot be truncated');
select throws_like($$delete from private.fleet_desk_credentials$$, '%', 'credential history cannot be deleted');
select throws_like($$update private.fleet_desk_credentials set credential_version = 9$$, '%',
  'credential history cannot be rewritten');
select throws_ok(
  $$update private.fleet_desk_owners set quiesced = false where provider_account_id = 'account'$$,
  '55000', 'Fleet desk owner changes advance one generation',
  'a direct write cannot reuse the current generation'
);
select throws_ok(
  $$update private.fleet_desk_owners set owner_generation = 9 where provider_account_id = 'account'$$,
  '55000', 'Fleet desk owner changes advance one generation', 'generations cannot skip ahead'
);
select throws_ok(
  $$update private.fleet_desk_owners set provider_account_label = 'Renamed', owner_generation = 2
    where provider_account_id = 'account'$$,
  '55000', 'Fleet desk owner changes advance one generation', 'owner identity fields are immutable'
);
select throws_ok(
  $$select private.fleet_resume_desk_owner('zalo', 'account', 0)$$,
  '55000', 'Fleet desk owner generation changed', 'stale operator readback cannot change the owner'
);
select throws_ok(
  $$select private.fleet_quiesce_desk_owner('zalo', 'account', 1)$$,
  '22023', 'Invalid Fleet desk quiesce transition', 'a quiesced owner cannot quiesce again'
);
select is(private.fleet_resume_desk_owner('zalo', 'account', 1) ->> 'ownerGeneration',
  '2', 'resume advances generation');
select throws_ok(
  $$select private.fleet_resume_desk_owner('zalo', 'account', 2)$$,
  '22023', 'Invalid Fleet desk quiesce transition', 'an active owner cannot resume again'
);

create function pg_temp.proof(p_id text, p_operation text default 'digest.read')
returns jsonb language sql as $$
  select jsonb_build_object('channel', 'zalo', 'account', 'account',
    'version', 2, 'conversationType', 'private_1_to_1', 'operation', p_operation,
    'bearerDeskId', 'm4', 'signingDeskId', 'm4', 'deskId', 'm4',
    'signingCredentialVersion', 1, 'credentialVersion', 1, 'ownerGeneration', '2',
    'senderHash', repeat('b', 64), 'conversationHash', repeat('c', 64),
    'eventHash', encode(sha256(convert_to(p_id, 'UTF8')), 'hex'))
$$;

create function pg_temp.admit(p_event jsonb, p_operation text)
returns text language plpgsql as $$
begin
  case p_operation
    when 'identity.verify' then
      return private.fleet_verify_link_code(decode(repeat('01', 32), 'hex'),
        decode(repeat('02', 32), 'hex'), p_event) ->> 'reason';
    when 'intent.submit' then
      return (select reason_code from private.fleet_submit_resolved_intent(
        'status_question', 'desk-visible', null, '{"topic":"status"}', p_event => p_event));
    when 'digest.read' then
      return private.fleet_read_desk_digest(p_event) ->> 'reason';
  end case;
end;
$$;

select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.proof('mismatch', operation) || override, operation),
  'unauthorized_desk_event', operation || ' rejects ' || label)
from unnest(array['identity.verify', 'intent.submit', 'digest.read']) as op(operation)
cross join (values
  ('bearer desk', '{"bearerDeskId":"old"}'::jsonb),
  ('signing desk', '{"signingDeskId":"old"}'),
  ('signing version', '{"signingCredentialVersion":2}'),
  ('signing version as text', '{"signingCredentialVersion":"1"}'),
  ('claimed desk', '{"deskId":"old"}'),
  ('claimed credential version', '{"credentialVersion":2}'),
  ('claimed owner generation', '{"ownerGeneration":"1"}'),
  ('future owner generation', '{"ownerGeneration":"3"}'),
  ('numeric owner generation', '{"ownerGeneration":2}'),
  ('missing owner generation', '{"ownerGeneration":null}'),
  ('unknown provider account', '{"account":"other"}'),
  ('wrong channel', '{"channel":"discord"}'),
  ('version one', '{"version":1}'),
  ('group conversation', '{"conversationType":"group"}'),
  ('wrong operation', '{"operation":"registry.recall"}')
) as mismatch(label, override);
reset role;
select is((select count(*) from private.fleet_provider_events where provider_account_id = 'account'),
  0::bigint, 'a denied desk does not consume the active desk event');
-- The wrong-channel case is audited under the channel its evidence names.
select is((select array_agg(channel || ':' || count order by channel) from (
    select channel, count(*) from private.fleet_audit_events
    where actor_id is null and reason_code = 'unauthorized_desk_event' group by channel) c),
  array['discord:3', 'zalo:42'], 'every refused desk event is audited without an actor');

select pg_temp.fixture_owner();
select throws_ok(
  $$select private.fleet_promote_desk_owner('zalo', 'account', 2, 'cloud', 2)$$,
  '22023', 'Invalid Fleet desk credential or cutover state', 'promotion requires a quiesced owner'
);
select is(private.fleet_quiesce_desk_owner('zalo', 'account', 2) ->> 'ownerGeneration',
  '3', 'quiesce advances generation');
select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.proof('quiesced', operation) || '{"ownerGeneration":"3"}', operation),
  'unauthorized_desk_event', operation || ' is fenced while quiesced')
from unnest(array['identity.verify', 'intent.submit', 'digest.read']) as op(operation);
reset role;

select pg_temp.fixture_owner();
select throws_ok(
  $$select private.fleet_promote_desk_owner('zalo', 'account', 3, 'm4', 2)$$,
  '22023', 'Invalid Fleet desk credential or cutover state', 'promotion names a different desk'
);
select throws_ok(
  $$select private.fleet_promote_desk_owner('zalo', 'account', 3, 'cloud', 1)$$,
  '22023', 'Invalid Fleet desk credential or cutover state', 'promotion needs a higher credential version'
);
select is(private.fleet_promote_desk_owner('zalo', 'account', 3, 'cloud', 2),
  '{"account":"account","deskId":"cloud","ownerGeneration":"4","credentialVersion":2,"quiesced":true}'::jsonb,
  'promotion advances generation and keeps admission quiesced');
select is(private.fleet_rollback_desk_owner('zalo', 'account', 4, 'm4', 3) ->> 'ownerGeneration',
  '5', 'rollback advances generation under a new credential version');
select is(private.fleet_resume_desk_owner('zalo', 'account', 5) ->> 'ownerGeneration',
  '6', 'resumed rollback owner uses a fresh generation');
select throws_ok(
  $$select private.fleet_rotate_desk_credential('zalo', 'account', 6, 3)$$,
  '22023', 'Invalid Fleet desk credential or cutover state', 'rotation needs a higher credential version'
);
select is(private.fleet_rotate_desk_credential('zalo', 'account', 6, 4),
  '{"account":"account","deskId":"m4","ownerGeneration":"7","credentialVersion":4,"quiesced":false}'::jsonb,
  'rotation keeps the desk and advances the credential and generation');
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
    where action = 'desk.owner.change' and desk_owner_change ->> 'account' = 'account'),
  array['register', 'resume', 'quiesce', 'promote', 'rollback', 'resume', 'rotate'],
  'every owner change records its reason and account');
select ok((select bool_and(actor_id = 'fe000000-0000-4000-8000-000000000001') from private.fleet_audit_events
    where action = 'desk.owner.change'), 'owner changes record the verified Owner');
select is((select array_agg(desk_id || ':' || credential_version order by assigned_at, desk_id)
    from private.fleet_desk_credentials where provider_account_id = 'account'),
  array['m4:1', 'cloud:2', 'm4:3', 'm4:4'], 'credential history records each admitted credential');

-- A second account may not reclaim a desk credential retired elsewhere.
select is(private.fleet_register_desk_owner('zalo', 'spare', 'Spare', 'spare', 1) ->> 'deskId',
  'spare', 'another account registers its own desk');
select throws_ok(
  $$select private.fleet_promote_desk_owner('zalo', 'spare', 1, 'cloud', 2)$$,
  '22023', 'Fleet desk credential version already used',
  'a retired desk credential cannot be admitted again on another account'
);
select is(private.fleet_promote_desk_owner('zalo', 'spare', 1, 'cloud', 5) ->> 'deskId',
  'cloud', 'a released desk can serve another account under a fresh credential');

select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.proof('stale-replica', operation)
    || '{"credentialVersion":4,"ownerGeneration":"7"}', operation),
  'unauthorized_desk_event', operation || ' refuses a retired verifying key with current signed claims')
from unnest(array['identity.verify', 'intent.submit', 'digest.read']) as op(operation);
select is(pg_temp.admit(pg_temp.proof('stale-claims', operation)
    || '{"signingCredentialVersion":4,"ownerGeneration":"7"}', operation),
  'unauthorized_desk_event', operation || ' refuses claims for a retired credential')
from unnest(array['identity.verify', 'intent.submit', 'digest.read']) as op(operation);
select is(pg_temp.admit(pg_temp.proof('retired-desk', operation)
    || '{"bearerDeskId":"cloud","signingDeskId":"cloud","deskId":"cloud","signingCredentialVersion":2,"credentialVersion":2,"ownerGeneration":"7"}', operation),
  'unauthorized_desk_event', operation || ' refuses the promoted-away desk')
from unnest(array['identity.verify', 'intent.submit', 'digest.read']) as op(operation);
reset role;

create temporary table desk_reads (name text primary key, value jsonb);
grant select, insert on desk_reads to service_role;

create function pg_temp.current_proof(p_id text, p_operation text default 'digest.read')
returns jsonb language sql as $$
  select pg_temp.proof(p_id, p_operation)
    || '{"credentialVersion":4,"signingCredentialVersion":4,"ownerGeneration":"7"}'
$$;

insert into private.fleet_projects (key, name_en, name_vi, target_mapping) values
  ('desk-visible', 'Visible', 'Visible', '{"lane":{"alpha":"fe000000-0000-4000-8000-000000000010"}}'),
  ('desk-hidden', 'Hidden', 'Hidden', '{}');
insert into private.fleet_digest_display_values (project_key, field, value) values
  ('desk-visible', 'lane', 'Alpha'), ('desk-hidden', 'lane', 'Beta');
insert into private.fleet_project_digests (project_key, generated_at, lanes) values
  ('desk-visible', now(), '[{"lane":"Alpha","state":"running","blockerCodes":[]}]'),
  ('desk-hidden', now(), '[{"lane":"Beta","state":"running","blockerCodes":[]}]');
insert into private.fleet_access_grants (user_id, auth_user_id, tier, capabilities, questions_per_hour)
  values ('fe000000-0000-4000-8000-000000000002', 'fe000000-0000-4000-8000-000000000002',
    'steerer', '{status.read,ask,priority.set,approve.low}', 1),
  ('fe000000-0000-4000-8000-000000000003', 'fe000000-0000-4000-8000-000000000003',
    'observer', '{ask}', 30);
insert into private.fleet_access_grant_projects (user_id, project_key) values
  ('fe000000-0000-4000-8000-000000000002', 'desk-visible'),
  ('fe000000-0000-4000-8000-000000000003', 'desk-visible');
insert into private.fleet_channel_identities
  (user_id, channel, provider_account_id, sender_hash, private_conversation_id) values
  ('fe000000-0000-4000-8000-000000000002', 'zalo', 'account',
    decode(repeat('b', 64), 'hex'), repeat('c', 64)),
  ('fe000000-0000-4000-8000-000000000003', 'zalo', 'account',
    decode(repeat('e', 64), 'hex'), repeat('f', 64));

select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.current_proof('wrong-thread') || jsonb_build_object('conversationHash', repeat('d', 64)), 'digest.read'),
  'unlinked_identity', 'digest requires the linked private conversation');
select is(pg_temp.admit(pg_temp.current_proof('wrong-sender') || jsonb_build_object('senderHash', repeat('d', 64)), 'digest.read'),
  'unlinked_identity', 'digest requires the linked provider sender');
select is(pg_temp.admit(pg_temp.current_proof('no-status-read')
    || jsonb_build_object('senderHash', repeat('e', 64), 'conversationHash', repeat('f', 64)), 'digest.read'),
  'missing_capability', 'digest requires status.read even with ask');
insert into pg_temp.desk_reads values ('read', private.fleet_read_desk_digest(pg_temp.current_proof('read')));
select is((select value -> 'sections' from pg_temp.desk_reads where name = 'read'),
  private.fleet_get_digest('fe000000-0000-4000-8000-000000000002'),
  'desk digest returns the session digest projection for the linked grant');
select is((select array_agg(s ->> 'projectKey') from pg_temp.desk_reads r,
    jsonb_array_elements(r.value -> 'sections') s where r.name = 'read'),
  array['desk-visible'], 'desk digest excludes projects outside the grant');
select is(pg_temp.admit(pg_temp.current_proof('read', 'intent.submit'), 'intent.submit'),
  'event_replayed', 'digest consumes the same replay slot as intent submission');
select is(private.fleet_read_desk_digest(pg_temp.current_proof('another-read')),
  '{"reason":"questions_per_hour"}'::jsonb, 'second digest exceeds the question quota and returns no sections');
select is(pg_temp.admit(pg_temp.current_proof('question', 'intent.submit'), 'intent.submit'),
  'questions_per_hour', 'digest debits the same quota used by status-question intents');
select is((select reason_code from private.fleet_submit_resolved_intent(
    'priority.set', 'desk-visible', 'alpha', '{"priority":"high"}',
    p_event => pg_temp.current_proof('priority', 'intent.submit'))),
  'accepted', 'desk can submit an intent from a linked Steerer');
reset role;

select ok((select state = 'pending_approval' and approver_id is null from private.fleet_intents
    where requester_id = 'fe000000-0000-4000-8000-000000000002' and kind = 'priority.set'),
  'a linked Steerer with approve.low still cannot approve via desk credentials');
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
    where action = 'digest.read' and actor_id = 'fe000000-0000-4000-8000-000000000002'),
  array['accepted', 'questions_per_hour'], 'digest reads and refusals are audited for the linked actor');

select pg_temp.fixture_owner();
select private.fleet_set_stopped(true, 'desk_test');
select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.current_proof('stopped'), 'digest.read'),
  'fleet_stopped', 'live stop supersedes quota and blocks reads');
reset role;
select pg_temp.fixture_owner();
select private.fleet_set_stopped(false, 'desk_test');
select private.fleet_revoke_access('fe000000-0000-4000-8000-000000000002', 'desk_test');
select pg_temp.as_service();
set local role service_role;
select is(pg_temp.admit(pg_temp.current_proof('revoked'), 'digest.read'),
  'inactive_grant', 'revocation supersedes quota and blocks reads');
reset role;

select * from finish();
rollback;
