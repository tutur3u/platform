begin;
select plan(53);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('fc000000-0000-4000-8000-000000000001', 'fleet-submit@example.com', now(), '{}', '{}'),
  ('fc000000-0000-4000-8000-000000000002', 'fleet-other@example.com', now(), '{}', '{}');

insert into private.fleet_projects (key, name_en, name_vi, target_mapping) values
  ('intent-local', 'Local', 'Local', '{"lane":{"alpha":"fc000000-0000-4000-8000-000000000010","shared":"fc000000-0000-4000-8000-000000000012"}}'),
  ('intent-remote', 'Remote', 'Remote', '{"lane":{"beta":"fc000000-0000-4000-8000-000000000011","shared":"fc000000-0000-4000-8000-000000000013"}}');
insert into private.fleet_digest_display_values (project_key, field, value) values
  ('intent-local', 'lane', 'Alpha'), ('intent-local', 'releaseTitle', '123'),
  ('intent-local', 'readinessItem', '123');
insert into private.fleet_access_grants (user_id, auth_user_id, tier, capabilities, intents_per_day)
select id, id, 'observer', '{ask,intent.request}', 1 from auth.users
where id in ('fc000000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002');
insert into private.fleet_access_grant_projects (user_id, project_key) values
  ('fc000000-0000-4000-8000-000000000001', 'intent-local'),
  ('fc000000-0000-4000-8000-000000000002', 'intent-remote');

insert into private.fleet_desk_owners
  (channel, provider_account_id, provider_account_label, desk_id, credential_version, quiesced)
values
  ('zalo', 'account-a', 'Operations Zalo', 'desk-a', 1, false),
  ('zalo', 'account-b', 'Other Zalo', 'desk-b', 1, false);

create function pg_temp.event(
  p_id text, p_account text default 'account-a', p_conversation text default repeat('c', 64)
)
returns jsonb language sql as $$
  select jsonb_build_object('channel', 'zalo', 'account', p_account,
    'version', 2, 'conversationType', 'private_1_to_1', 'operation', 'identity.verify',
    'bearerDeskId', case when p_account = 'account-a' then 'desk-a' else 'desk-b' end,
    'signingDeskId', case when p_account = 'account-a' then 'desk-a' else 'desk-b' end,
    'deskId', case when p_account = 'account-a' then 'desk-a' else 'desk-b' end,
    'signingCredentialVersion', 1, 'credentialVersion', 1, 'ownerGeneration', '1',
    'eventHash', encode(sha256(convert_to(p_id, 'UTF8')), 'hex'),
    'senderHash', repeat('b', 64), 'conversationHash', p_conversation)
$$;

create function pg_temp.submit(
  p_event jsonb, p_target text default 'alpha', p_project text default 'intent-local',
  p_quote text default 'Display only'
)
returns text language sql as $$
  select reason_code from private.fleet_submit_resolved_intent(
    'priority.set', p_project, p_target, '{"priority":"high"}',
    p_event => p_event || '{"operation":"intent.submit"}', p_redacted_quote => p_quote)
$$;

create temporary table link_results (name text primary key, value jsonb);
grant select, insert on link_results to service_role;

select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('fleet_create_link_code', 'fleet_verify_link_code',
      'fleet_confirm_link_code', 'fleet_submit_resolved_intent', 'fleet_list_intents')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'no client execution grants on intent or identity RPCs');
select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  where c.relnamespace = 'private'::regnamespace
    and c.relname in ('fleet_identity_link_codes', 'fleet_provider_events')
    and has_table_privilege(caller, c.oid, 'SELECT, INSERT, UPDATE, DELETE')
), 'identity codes and replay ledger are available only through RPCs');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000001',
  decode(repeat('01', 32), 'hex')), true, 'live Fleet user can issue a code');
select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000002',
  decode(repeat('02', 32), 'hex')), true, 'separate user can issue a code');
reset role;
select ok((select expires_at > clock_timestamp() + interval '9 minutes'
  and expires_at <= clock_timestamp() + interval '10 minutes'
  from private.fleet_identity_link_codes
  where user_id = 'fc000000-0000-4000-8000-000000000001'), 'code expires within ten minutes');
update private.fleet_identity_link_codes set expires_at = clock_timestamp() - interval '1 second'
where user_id = 'fc000000-0000-4000-8000-000000000002';

set local role service_role;
select is(private.fleet_verify_link_code(decode(repeat('02', 32), 'hex'),
  decode(repeat('12', 32), 'hex'), pg_temp.event('expired')) ->> 'reason',
  'invalid_link_code', 'an expired code cannot be verified');
insert into link_results values ('first', private.fleet_verify_link_code(
  decode(repeat('01', 32), 'hex'), decode(repeat('11', 32), 'hex'), pg_temp.event('first')));
select is((select value ->> 'reason' from link_results where name = 'first'),
  'pending', 'desk verification creates a pending link');
select is(private.fleet_verify_link_code(decode(repeat('01', 32), 'hex'),
  decode(repeat('12', 32), 'hex'), pg_temp.event('first')) ->> 'reason',
  'event_replayed', 'an event cannot be replayed');
select is(private.fleet_verify_link_code(decode(repeat('01', 32), 'hex'),
  decode(repeat('12', 32), 'hex'), pg_temp.event('fresh-event')) ->> 'reason',
  'invalid_link_code', 'a code is single use even with a fresh event');
select is(pg_temp.submit(pg_temp.event('before-confirm')), 'unlinked_identity',
  'verified sender cannot submit before signed-in confirmation');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000002',
  (select (value ->> 'linkId')::uuid from link_results where name = 'first'),
  decode(repeat('11', 32), 'hex')) ->> 'reason', 'invalid_confirmation', 'another user cannot confirm the link');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000001',
  (select (value ->> 'linkId')::uuid from link_results where name = 'first'),
  decode(repeat('12', 32), 'hex')) ->> 'reason', 'invalid_confirmation', 'confirmation needs proof from the desk');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000001',
  (select (value ->> 'linkId')::uuid from link_results where name = 'first'),
  decode(repeat('11', 32), 'hex'), true),
  '{"reason":"pending","channel":"zalo","accountLabel":"Operations Zalo"}'::jsonb,
  'verified web preview returns the desk label without consuming the link');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000001',
  (select (value ->> 'linkId')::uuid from link_results where name = 'first'),
  decode(repeat('11', 32), 'hex')) ->> 'reason', 'confirmed', 'code owner confirms the pending link');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000001',
  (select (value ->> 'linkId')::uuid from link_results where name = 'first'),
  decode(repeat('11', 32), 'hex')) ->> 'reason', 'invalid_confirmation', 'confirmation is single use');
select is(pg_temp.submit(pg_temp.event('first')), 'event_replayed',
  'replay protection spans verification and submission');
select is(pg_temp.submit(pg_temp.event('first', 'account-b')), 'unlinked_identity',
  'event identifiers are scoped per provider account');
select is(pg_temp.submit(pg_temp.event('wrong-thread', 'account-a', repeat('d',64))),
  'unlinked_identity', 'sender must match the confirmed private conversation');
select is(pg_temp.submit(pg_temp.event('wrong-label'), 'beta'),
  'project_outside_grant', 'a caller project label cannot disguise the target project');
select is(pg_temp.submit(pg_temp.event('out-of-grant'), 'beta', 'intent-remote'),
  'project_outside_grant', 'target outside the linked actor grant is denied');
select is(pg_temp.submit(pg_temp.event('ambiguous'), 'shared'),
  'project_outside_grant', 'catalog aliases shared across projects fail closed');
select is(pg_temp.submit(pg_temp.event('approved-target')), 'accepted', 'the linked actor can submit');
select is(pg_temp.submit(pg_temp.event('approved-target')), 'event_replayed',
  'a submitted event cannot be replayed');
select is(pg_temp.submit(pg_temp.event('over-quota'), p_quote => 'Refused quote'),
  'intents_per_day', 'live quota applies to the linked actor');
select is(pg_temp.submit(pg_temp.event('over-quota')), 'event_replayed',
  'a refused authenticated event is still consumed');

select is(jsonb_array_length(private.fleet_list_intents('fc000000-0000-4000-8000-000000000002')),
  0, 'the other actor cannot read the receipt');
select is(private.fleet_list_intents('fc000000-0000-4000-8000-000000000001') -> 0 ->> 'state',
  'pending_approval', 'receipt shows the Observer pending approval state');

select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000002',
  decode(repeat('03', 32), 'hex')), true, 'the other user can request a fresh code');
insert into link_results values ('duplicate', private.fleet_verify_link_code(
  decode(repeat('03', 32), 'hex'), decode(repeat('13', 32), 'hex'), pg_temp.event('duplicate')));
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000002',
  (select (value ->> 'linkId')::uuid from link_results where name = 'duplicate'),
  decode(repeat('13', 32), 'hex')) ->> 'reason', 'identity_already_linked',
  'keyed sender hash is unique per provider account and channel');

select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000002',
  decode(repeat('04', 32), 'hex')), true, 'the other user can obtain an expiring code');
insert into link_results values ('expired-pending', private.fleet_verify_link_code(
  decode(repeat('04', 32), 'hex'), decode(repeat('14', 32), 'hex'), pg_temp.event('expiring-link')));
reset role;
update private.fleet_identity_link_codes set expires_at = clock_timestamp() - interval '1 second'
where user_id = 'fc000000-0000-4000-8000-000000000002';
set local role service_role;
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000002',
  (select (value ->> 'linkId')::uuid from link_results where name = 'expired-pending'),
  decode(repeat('14', 32), 'hex')) ->> 'reason', 'invalid_confirmation',
  'a pending link cannot be confirmed after its original code expires');
reset role;
select ok((select expires_at <= clock_timestamp()
  and num_nonnulls(pending_id, confirmation_hash, channel, provider_account_id,
    provider_account_label, sender_hash, conversation_hash) = 0
  from private.fleet_identity_link_codes where user_id = 'fc000000-0000-4000-8000-000000000002'),
  'an expired confirmation clears pending identity fields and leaves the row for retention');

set local role service_role;
select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000002',
  decode(repeat('05', 32), 'hex')), true, 'a new code can replace the expired one');
insert into link_results values ('replace-pending', private.fleet_verify_link_code(
  decode(repeat('05', 32), 'hex'), decode(repeat('15', 32), 'hex'), pg_temp.event('replace-link')));
select is(private.fleet_create_link_code('fc000000-0000-4000-8000-000000000002',
  decode(repeat('06', 32), 'hex')), true, 'a fresh code replaces an unexpired pending link');
select is(private.fleet_confirm_link_code('fc000000-0000-4000-8000-000000000002',
  (select (value ->> 'linkId')::uuid from link_results where name = 'replace-pending'),
  decode(repeat('15', 32), 'hex')) ->> 'reason', 'invalid_confirmation',
  'a fresh code invalidates confirmation of the superseded pending link');
reset role;

select is((select num_nonnulls(pending_id, confirmation_hash, channel, provider_account_id,
    provider_account_label, sender_hash, conversation_hash)
  from private.fleet_identity_link_codes where user_id = 'fc000000-0000-4000-8000-000000000002'),
  0, 'issuing a fresh link code clears pending metadata');
select is((select array_agg(distinct reason_code order by reason_code) from private.fleet_audit_events
  where actor_id is null and channel = 'zalo' and action = 'intent.submit'),
  array['event_replayed', 'unlinked_identity'], 'desk refusals without an actor are audited');
select is((select array_agg(distinct reason_code order by reason_code) from private.fleet_audit_events
  where actor_id is null and channel = 'zalo' and action = 'identity.verify'),
  array['event_replayed', 'invalid_link_code'], 'failed desk link verification is audited');
select ok((select count(*) > 0 and bool_and(consumed_at <= clock_timestamp())
  from private.fleet_provider_events), 'consumption timestamps record when events entered the ledger');
select is((select requester_id from private.fleet_intents where channel = 'zalo'),
  'fc000000-0000-4000-8000-000000000001'::uuid, 'requester comes from the verified link');
select is((select payload from private.fleet_intents where channel = 'zalo'),
  '{"priority":"high","targetType":"lane","targetId":"fc000000-0000-4000-8000-000000000010"}'::jsonb,
  'execution payload contains resolved target and parameters only');
select ok((select action_hash = sha256(convert_to(jsonb_build_object(
    'kind', kind, 'projects', '{"intent-local":1}'::jsonb, 'payload',
    '{"priority":"high","targetType":"lane","targetId":"fc000000-0000-4000-8000-000000000010"}'::jsonb
  )::text, 'UTF8')) from private.fleet_intents where channel = 'zalo'),
  'the hash binds the catalog project version and resolved action without quote text');
select ok((private.fleet_list_intents('fc000000-0000-4000-8000-000000000001') -> 0) ?& array['id','kind','state','createdAt']
  and not ((private.fleet_list_intents('fc000000-0000-4000-8000-000000000001') -> 0) ?| array['payload','quote']),
  'receipt projection returns typed metadata without payload or quote');

select is((select array_agg(q.redacted_quote) from private.fleet_intent_quotes q
  join private.fleet_intents i on i.id = q.intent_id where i.channel = 'zalo'),
  array['Display only'], 'accepted quote is separate and refusals store no quote');
update private.fleet_access_grants set revoked_at = clock_timestamp()
where user_id = 'fc000000-0000-4000-8000-000000000001';
set local role service_role;
select is(pg_temp.submit(pg_temp.event('revoked')), 'inactive_grant',
  'desk submission checks grant revocation even with a valid linked identity');
select is(private.fleet_list_intents('fc000000-0000-4000-8000-000000000001'),
  null::jsonb, 'receipt reads also require a live grant');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","eta":123,"blockerCodes":[]}]'),
  'invalid_digest', 'direct digest writes reject a non-string ETA');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","shortSha":1234567,"blockerCodes":[]}]'),
  'invalid_digest', 'direct digest writes reject a non-string short SHA');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","blockerCodes":[true]}]'),
  'invalid_digest', 'direct digest writes reject non-string blocker entries');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","releaseTitle":123,"blockerCodes":[]}]'),
  'invalid_digest', 'an approved numeric-looking release title still requires a string');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","releaseTitle":null,"blockerCodes":[]}]'),
  'invalid_digest', 'release title rejects explicit JSON null');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","readinessItem":123,"blockerCodes":[]}]'),
  'invalid_digest', 'an approved numeric-looking readiness item still requires a string');
select is(private.fleet_publish_digest('intent-local', now(),
  '[{"lane":"Alpha","state":"ready","readinessItem":null,"blockerCodes":[]}]'),
  'invalid_digest', 'readiness item rejects explicit JSON null');
reset role;

select * from finish();
rollback;
