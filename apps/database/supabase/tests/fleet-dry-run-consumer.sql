\ir helpers/local-dblink.inc

begin;
select no_plan();

select is((select count(*) from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname in (
    'fleet_consumer_status', 'fleet_consumer_claim', 'fleet_consumer_receipt', 'fleet_consumer_purge'
  ) and p.prosecdef and p.proconfig = array['search_path=pg_catalog, pg_temp']
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  4::bigint, 'only the service role can execute the pinned consumer functions');
select ok(not exists (
  select from unnest(array['fleet_intent_quotes', 'fleet_provider_events',
    'fleet_identity_link_codes', 'fleet_consumer_progress', 'fleet_intents']) as t(name)
  where has_table_privilege('service_role', 'private.' || name, 'DELETE')
    or has_table_privilege('service_role', 'private.' || name, 'UPDATE')
), 'service has no direct write access to the maintenance tables');

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('f5000000-0000-4000-8000-000000000001', 'fleet-dry-run-requester@example.com', now(), '{}', '{}'),
  ('f5000000-0000-4000-8000-000000000002', 'fleet-dry-run-approver@example.com', now(), '{}', '{}');
insert into private.fleet_projects (key, name_en, name_vi)
values ('fleet-dry-run', 'Dry run', 'Chạy thử'), ('fleet-drift', 'Mapping', 'Ánh xạ');
insert into private.fleet_access_grants (user_id, tier, capabilities, questions_per_hour)
select id, 'steerer', case when id = 'f5000000-0000-4000-8000-000000000001'
  then array['ask', 'comment', 'work.create'] else array['approve.low'] end, 500
from auth.users where id in ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002');
insert into private.fleet_access_grant_projects (user_id, project_key)
select user_id, key from private.fleet_access_grants cross join private.fleet_projects
where user_id in ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002')
  and key in ('fleet-dry-run', 'fleet-drift');

create function pg_temp.add_question(p_n int, p_project text default 'fleet-dry-run')
returns uuid language sql as $$
  insert into private.fleet_intents (id, requester_id, channel, kind, payload, action_hash, project_versions)
  values (md5('fleet-question-' || p_n)::uuid, 'f5000000-0000-4000-8000-000000000001',
    'web', 'status_question', '{}', decode(repeat('01', 32), 'hex'),
    jsonb_build_object(p_project, (select target_mapping_version from private.fleet_projects where key = p_project)))
  returning id
$$;

create temp table consumer_fixture (slot timestamptz, generation text, batch jsonb);
insert into consumer_fixture (slot, generation)
select private.fleet_consumer_slot(), generation::text from private.fleet_control;
grant select, update on consumer_fixture to service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.add_question(n) from generate_series(1, 21) n;

set local role service_role;
select is(private.fleet_consumer_status() ->> 'state', 'active', 'status reads the live control row');
update consumer_fixture set batch = private.fleet_consumer_claim(slot, generation);
select is((select jsonb_array_length(batch->'claims') from consumer_fixture),
  20, 'the first slot claims at most twenty intents');
select is((select private.fleet_consumer_claim(slot, generation) from consumer_fixture),
  (select batch from consumer_fixture), 'a duplicate slot retrieves the same current leases');
select is((select private.fleet_consumer_claim(slot - interval '15 minutes', generation) ->> 'state'
  from consumer_fixture), 'slot_closed', 'a historical slot cannot admit another batch');
reset role;
select is((select count(*) from private.fleet_intents where state = 'approved'), 1::bigint,
  'the overflow intent remains approved');

-- The first transaction keeps its claim watermark locked. A separate
-- session must wait rather than admitting a concurrent batch.
select extensions.dblink_connect('fleet_consumer_race', pg_temp.fixture_dblink_connstr());
select extensions.dblink_exec('fleet_consumer_race', 'set lock_timeout = ''150ms''');
select extensions.dblink_exec('fleet_consumer_race', 'set request.jwt.claims = ''{"role":"service_role"}''');
select count(*) from extensions.dblink('fleet_consumer_race',
  format('select private.fleet_consumer_claim(%L, %L)', (select slot from consumer_fixture),
    (select generation from consumer_fixture)), false) as contender(batch jsonb);
select is(split_part(extensions.dblink_error_message('fleet_consumer_race'), chr(10), 1),
  'ERROR:  canceling statement due to lock timeout', 'racing claims serialize on the slot watermark');
select extensions.dblink_disconnect('fleet_consumer_race');

create function pg_temp.receipt(p_n int, p_override_lease uuid default null, p_state text default 'dry_run')
returns text language sql as $$
  select private.fleet_consumer_receipt(f.slot, f.generation, (c->>'id')::uuid,
    coalesce(p_override_lease, (c->>'leaseId')::uuid), (c->>'idempotencyKey')::uuid, p_state) ->> 'state'
  from consumer_fixture f cross join lateral jsonb_array_elements(f.batch->'claims') c
  where c->>'id' = md5('fleet-question-' || p_n)::uuid::text
$$;
select throws_ok($$update private.fleet_intents set state = 'dispatched'
  where id = md5('fleet-question-1')::uuid$$, '23514',
  'Fleet dry-run leases cannot dispatch', 'the transition trigger fences dry-run dispatch');
select throws_ok($$select pg_temp.receipt(1, null, 'dispatched')$$, '23514',
  null, 'the RPC rejects a dispatch receipt');
select is(pg_temp.receipt(1, gen_random_uuid()), 'lease_conflict', 'wrong lease is denied');
select is(pg_temp.receipt(1), 'dry_run', 'a matching current lease records a dry-run receipt');
select is(pg_temp.receipt(1), 'dry_run', 'a lost receipt response replays without writing');
select is((select count(*) from private.fleet_audit_events where action = 'consumer.receipt'),
  1::bigint, 'receipt replay emits no second audit event');
select is((select state::text from private.fleet_intents where id = md5('fleet-question-1')::uuid),
  'done', 'dry run completes directly with its receipt');

-- Represent the last slot without sleeping or changing the database clock.
update private.fleet_consumer_progress set claim_slot = claim_slot - interval '15 minutes';
update private.fleet_intents set dry_run_slot = dry_run_slot - interval '15 minutes'
  where state = 'claimed';
update private.fleet_intents set lease_expires_at = clock_timestamp() - interval '1 second'
  where id = md5('fleet-question-2')::uuid;
update consumer_fixture f set batch = private.fleet_consumer_claim(f.slot, f.generation);
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-2')::uuid),
  'lease_expired', 'restart settles an expired lease without assigning a new one');
select is(pg_temp.receipt(3), 'dry_run', 'restart can finish a still-live lease');
select pg_temp.receipt(6);
select ok((select lease_expires_at - created_at >= interval '15 minutes'
  from private.fleet_intents where id = md5('fleet-question-3')::uuid), 'leases last fifteen minutes');

-- Build an independently approved action, then revoke its approver.
insert into private.fleet_intents (id, requester_id, channel, kind, payload, action_hash, project_versions)
values (md5('fleet-other-approver')::uuid, 'f5000000-0000-4000-8000-000000000001',
  'web', 'work.create', '{}', decode(repeat('01', 32), 'hex'), '{"fleet-dry-run":1}');
update private.fleet_intents set state = 'approved',
  approver_id = 'f5000000-0000-4000-8000-000000000002', approver_generation = 1
  where id = md5('fleet-other-approver')::uuid;
update private.fleet_access_grants set revoked_at = clock_timestamp()
  where user_id = 'f5000000-0000-4000-8000-000000000002';

select pg_temp.add_question(22, 'fleet-drift');
insert into private.fleet_projects (key, name_en, name_vi)
values ('fleet-receipt-drift', 'Receipt mapping', 'Ánh xạ biên nhận');
insert into private.fleet_access_grant_projects (user_id, project_key)
values ('f5000000-0000-4000-8000-000000000001', 'fleet-receipt-drift');
select pg_temp.add_question(23, 'fleet-receipt-drift');
update private.fleet_projects set target_mapping = '{"lane":{}}' where key = 'fleet-drift';
update private.fleet_consumer_progress set claim_slot = null;
update consumer_fixture f set batch = private.fleet_consumer_claim(f.slot, f.generation);
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-other-approver')::uuid),
  'stale_grant', 'claim voids a revoked approver');
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-22')::uuid),
  'stale_mapping', 'claim voids a stale target mapping');
update private.fleet_projects set target_mapping = '{"lane":{}}' where key = 'fleet-receipt-drift';
select is(pg_temp.receipt(23), 'voided', 'receipt rechecks the target mapping');
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-23')::uuid),
  'stale_mapping', 'receipt records the stale mapping refusal');
update private.fleet_access_grants set questions_per_hour = 501
  where user_id = 'f5000000-0000-4000-8000-000000000001';
select is(pg_temp.receipt(4), 'voided', 'receipt rechecks the requester generation');
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-4')::uuid),
  'stale_grant', 'receipt records the stale requester refusal');

update private.fleet_control set stopped = true;
select is(private.fleet_consumer_status()->>'state', 'stopped', 'persisted Fleet stop is visible');
select is((select private.fleet_consumer_claim(slot, generation)->>'state' from consumer_fixture),
  'stopped', 'database stops claims even with a previously read generation');
select is(pg_temp.receipt(5), 'stopped', 'database fences receipts already in flight');
select is((select private.fleet_consumer_purge(slot, generation)->>'state' from consumer_fixture),
  'stopped', 'database fences the purge');
update private.fleet_control set stopped = false;
select is((select private.fleet_consumer_claim(slot, generation)->>'state' from consumer_fixture),
  'stopped', 'a stop and resume invalidates an earlier worker observation');
update consumer_fixture set generation = private.fleet_consumer_status()->>'generation';
update private.fleet_consumer_progress set claim_slot = null;
select private.fleet_consumer_claim(slot, generation) from consumer_fixture;
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-5')::uuid),
  'stale_stop', 'resume voids work authorized under the earlier stop generation');

-- Keep each fence independent of revocation, expiry and the other checks.
update private.fleet_access_grants set revoked_at = null
  where user_id = 'f5000000-0000-4000-8000-000000000002';
update private.fleet_access_grants set intents_per_day = 3
  where user_id = 'f5000000-0000-4000-8000-000000000001';
insert into private.fleet_intents (id, requester_id, channel, kind, payload, action_hash, project_versions)
select md5(fixture)::uuid, 'f5000000-0000-4000-8000-000000000001',
  'web', 'work.create', '{}', decode(repeat('01', 32), 'hex'), '{"fleet-dry-run":1}'
from unnest(array['fleet-approver-generation', 'fleet-medium-quota']) fixture;
update private.fleet_intents i set state = 'approved', approver_id = g.user_id,
  approver_generation = g.generation
  from private.fleet_access_grants g
  where i.id = md5('fleet-approver-generation')::uuid
    and g.user_id = 'f5000000-0000-4000-8000-000000000002';
update private.fleet_access_grants set generation = generation + 1
  where user_id = 'f5000000-0000-4000-8000-000000000002';
update private.fleet_intents i set state = 'approved', approver_id = g.user_id,
  approver_generation = g.generation
  from private.fleet_access_grants g
  where i.id = md5('fleet-medium-quota')::uuid
    and g.user_id = 'f5000000-0000-4000-8000-000000000002';

select pg_temp.add_question(24, 'fleet-drift');
delete from private.fleet_access_grant_projects
  where user_id = 'f5000000-0000-4000-8000-000000000001' and project_key = 'fleet-drift';

-- The admission trigger normally prevents this fourth counted intent. Inject
-- excess usage to exercise the later quota fence without editing the grant.
alter table private.fleet_intents disable trigger fleet_admit_intent;
insert into private.fleet_intents (id, requester_id, channel, kind, payload, risk, action_hash,
  project_versions, requester_generation, stop_generation, state, idempotency_key, expires_at)
select md5('fleet-excess-usage')::uuid, requester_id, channel, kind, payload, risk, action_hash,
  project_versions, requester_generation, stop_generation, 'cancelled', gen_random_uuid(), expires_at
from private.fleet_intents where id = md5('fleet-medium-quota')::uuid;
alter table private.fleet_intents enable trigger fleet_admit_intent;

update private.fleet_consumer_progress set claim_slot = null;
select private.fleet_consumer_claim(slot, generation) from consumer_fixture;
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-approver-generation')::uuid),
  'stale_grant', 'claim voids an approval when only the live approver generation changes');
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-question-24')::uuid),
  'stale_scope', 'claim voids an intent after its project is removed from the grant');
select is((select receipt->>'state' from private.fleet_intents where id = md5('fleet-medium-quota')::uuid),
  'quota_exhausted', 'claim voids a medium-risk intent when rolling usage exceeds the grant budget');

insert into private.fleet_intent_quotes (intent_id, redacted_quote, created_at)
values (md5('fleet-question-1')::uuid, 'Expired quote', clock_timestamp() - interval '91 days'),
  (md5('fleet-question-2')::uuid, 'Current quote', clock_timestamp());
insert into private.fleet_provider_events (channel, provider_account_id, event_hash, consumed_at)
select 'zalo', 'retention-fixture', sha256(convert_to(n::text, 'UTF8')), clock_timestamp() - interval '91 days'
from generate_series(1, 335) n;
insert into private.fleet_provider_events (channel, provider_account_id, event_hash)
values ('zalo', 'retention-fixture', sha256(convert_to('fresh', 'UTF8')));
insert into private.fleet_identity_link_codes (user_id, code_hash, expires_at)
values
  ('f5000000-0000-4000-8000-000000000001', decode(repeat('ab', 32), 'hex'), clock_timestamp() - interval '1 minute'),
  ('f5000000-0000-4000-8000-000000000002', decode(repeat('cd', 32), 'hex'), clock_timestamp() + interval '5 minutes');
set local role service_role;
select is((select private.fleet_consumer_purge(slot, generation) from consumer_fixture),
  '{"state":"purged","counts":{"quotes":1,"events":333,"linkCodes":1}}'::jsonb,
  'one bounded purge deletes due rows from each store and reports counts');
select is((select private.fleet_consumer_purge(slot, generation) from consumer_fixture),
  '{"state":"purged","counts":{"quotes":1,"events":333,"linkCodes":1}}'::jsonb,
  'retry reconciles the stored purge result without taking another batch');
reset role;
select is((select count(*) from private.fleet_audit_events where action = 'retention.purge'
  and retention_counts = '{"quotes":1,"events":333,"linkCodes":1}'::jsonb),
  1::bigint, 'purge has one append-only counts audit');
select is((select count(*) from private.fleet_provider_events where provider_account_id = 'retention-fixture'),
  3::bigint, 'purge preserves the overflow and fresh provider event');
select is((select count(*) from private.fleet_intent_quotes), 1::bigint, 'fresh quote remains');
select is((select count(*) from private.fleet_identity_link_codes), 1::bigint, 'live code remains');
select is((select count(*) from private.fleet_intents), 28::bigint, 'intent history survives retention');
select is((select count(*) from private.fleet_intents where state = 'dispatched'), 0::bigint,
  'no dry-run intent reached dispatched');

select * from finish();
rollback;
