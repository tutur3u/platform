begin;
select plan(85);

-- The quota race suite retains a revoked grant for its synthetic fixture.
select is((select count(*) from private.fleet_access_grants
  where user_id <> 'fa000000-0000-4000-8000-000000000003' or revoked_at is null),
  0::bigint, 'no Fleet grants are seeded');
select ok((select owner_user_id is null from private.fleet_control), 'Fleet Owner is unconfigured');
create temporary view fleet_access_test_tables as
select oid, relrowsecurity from pg_class
where relnamespace = 'private'::regnamespace and relkind = 'r'
  and relname in (
    'fleet_projects', 'fleet_access_grants', 'fleet_access_grant_projects',
    'fleet_channel_identities', 'fleet_intents', 'fleet_intent_quotes',
    'fleet_audit_events', 'fleet_control',
    'fleet_digest_display_values', 'fleet_project_digests'
  );
select is(
  (select count(*) from fleet_access_test_tables where relrowsecurity),
  10::bigint, 'all Fleet access tables have RLS enabled'
);
select ok(not exists (
  select 1 from fleet_access_test_tables c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as privilege
  where has_table_privilege(caller, c.oid, privilege)
), 'API roles have no direct Fleet table privileges');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname in (
    'fleet_reject_audit_mutation', 'fleet_reject_fence_reset', 'fleet_check_grant',
    'fleet_version_project', 'fleet_version_control', 'fleet_check_intent_transition',
    'fleet_require_owner', 'fleet_grant_access', 'fleet_revoke_access',
    'fleet_set_stopped', 'fleet_admit_intent', 'fleet_submit_intent',
    'fleet_digest_labels_approved', 'fleet_get_access', 'fleet_get_digest', 'fleet_publish_digest'
  )
    and (caller <> 'service_role' or p.proname not in (
      'fleet_submit_intent', 'fleet_get_access', 'fleet_get_digest', 'fleet_publish_digest'
    ))
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'only designated Fleet access functions are executable by the service role');

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('fa000000-0000-4000-8000-000000000001', 'fleet-owner@example.com', now(), '{}', '{}'),
  ('fa000000-0000-4000-8000-000000000002', 'fleet-grantee@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('00000000-0000-0000-0000-000000000000', 'Fleet SQL root',
    'fa000000-0000-4000-8000-000000000001', false)
  on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type)
  values ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-000000000001', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;

insert into private.fleet_projects (key, name_en, name_vi)
  values ('fleet-test', 'Fleet test', 'Kiểm thử Fleet'), ('fleet-other', 'Other', 'Khác');
update private.fleet_control set owner_user_id = 'fa000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select private.fleet_set_stopped(true, 'test_stop')$$,
  '42501', 'Fleet Owner access required', 'configured root creator without an explicit grant cannot stop Fleet'
);

select set_config('request.jwt.claims', '{}', true);
select private.revoke_mastermind_access(user_id, 'Fleet SQL fixture')
  from public.workspace_role_members where role_id = (select role_id from private.mastermind_access_role);
select private.grant_mastermind_access('fa000000-0000-4000-8000-000000000001', 'Fleet SQL fixture');

savepoint unconfigured_owner;
update private.fleet_control set owner_user_id = null;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok($$select private.fleet_set_stopped(true, 'test_stop')$$,
  '42501', 'Fleet Owner access required', 'an explicit root grant alone cannot stop Fleet');
rollback to unconfigured_owner;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000002"}', true);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'observer', array['ask'], array['fleet-test'], 'test_grant')$$,
  '42501', 'Fleet Owner access required', 'non-Owner cannot grant Fleet access'
);
select throws_ok(
  $$select private.fleet_revoke_access('fa000000-0000-4000-8000-000000000002', 'test_revoke')$$,
  '42501', 'Fleet Owner access required', 'non-Owner cannot revoke Fleet access'
);
select throws_ok(
  $$select private.fleet_set_stopped(false, 'test_resume')$$,
  '42501', 'Fleet Owner access required', 'non-Owner cannot resume Fleet'
);

create function pg_temp.submit_fleet(p_kind private.fleet_intent_kind, p_versions jsonb default '{"fleet-test":1}', p_quote text default null)
returns text language sql as $$
  select reason_code from private.fleet_submit_intent(
    'fa000000-0000-4000-8000-000000000002', 'web', p_kind, '{}',
    decode(repeat('01', 32), 'hex'), p_versions, p_quote);
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('status_question'), 'inactive_grant', 'an ungranted account is denied by the submission RPC');
reset role;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'owner', array[]::text[], array['fleet-test'], 'test_grant')$$,
  '23514', 'The Owner tier cannot be granted', 'even the Owner cannot grant Owner tier'
);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'observer', array['approve.low'], array['fleet-test'], 'test_grant')$$,
  '23514', 'Capabilities exceed the Fleet tier ceiling', 'Observer cannot receive Steerer capabilities'
);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'operator', array['approve.migration'], array['fleet-test'], 'test_grant')$$,
  '23514', 'Capabilities exceed the Fleet tier ceiling', 'Operator cannot receive Owner capabilities'
);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'operator', array['ask', null], array['fleet-test'], 'test_grant')$$,
  '23514', 'Capabilities exceed the Fleet tier ceiling', 'NULL capabilities fail closed'
);
select is(private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
  'observer', array['ask', 'intent.request'], array['fleet-test'], 'test_grant',
  now() + interval '1 day', 1, 1), 1::bigint, 'Owner grants a scoped Observer subset');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('status_question', '{"fleet-test":1,"fleet-other":1}'),
  'project_outside_grant', 'adding an authorised project does not admit an out-of-scope project');
select is(pg_temp.submit_fleet('status_question', '{"fleet-test":2}', 'Refused quote'),
  'stale_project_mapping', 'stale target mapping is refused');
select is(pg_temp.submit_fleet('status_question', '{"fleet-test":1}', 'Redacted question'),
  'accepted', 'first question uses the hourly quota');
select is(pg_temp.submit_fleet('status_question'), 'questions_per_hour', 'hourly cap denies the next question');
select is(pg_temp.submit_fleet('approve.deploy'), 'accepted', 'Observer can file an Owner-only steer request');
select is(pg_temp.submit_fleet('comment'), 'intents_per_day', 'daily intent quota is independent of the hourly question quota');
reset role;

select is((select state::text from private.fleet_intents where kind = 'status_question'),
  'approved', 'a question needs no approval');
select ok((select state = 'pending_approval' and requires_owner_approval and risk = 'high'
  from private.fleet_intents where kind = 'approve.deploy'),
  'an Observer steer starts as high risk and pending Owner approval');
select is((select expires_at - created_at from private.fleet_intent_quotes),
  interval '2160 hours', 'quote expiry is 90 elapsed days');
select is((select array_agg(redacted_quote) from private.fleet_intent_quotes),
  array['Redacted question'], 'refused submissions store no quote');
select is((select count(*) from private.fleet_audit_events where reason_code in ('questions_per_hour', 'intents_per_day')),
  2::bigint, 'quota refusals persist as audit records without an intent');
select throws_ok(
  $$update private.fleet_intents set state = 'dispatched' where kind = 'approve.deploy'$$,
  '23514', 'Invalid Fleet intent state transition', 'a pending intent cannot bypass approval and claim'
);
select throws_ok(
  $$update private.fleet_intents set state = 'approved' where kind = 'approve.deploy'$$,
  '23514', 'Fleet approval requires an approver', 'a pending intent requires a recorded approver'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$update private.fleet_intents set state = 'approved',
    approver_id = 'fa000000-0000-4000-8000-000000000001' where kind = 'approve.deploy'$$,
  '23514', null, 'an approver requires a generation'
);
select throws_ok(
  $$update private.fleet_intents set state = 'approved',
    approver_id = requester_id, approver_generation = requester_generation where kind = 'approve.deploy'$$,
  '42501', 'Fleet Owner access required', 'an Observer cannot self-approve a high-risk request'
);
select throws_ok(
  $$update private.fleet_intents set state = 'expired' where kind = 'approve.deploy'$$,
  '23514', 'Fleet intent has not expired', 'a live intent cannot be marked expired'
);
select throws_ok(
  $$update private.fleet_intents set state = 'claimed' where kind = 'status_question'$$,
  '23514', null, 'claiming an approved intent requires a lease'
);
select throws_ok(
  $$update private.fleet_intents set approver_id = requester_id where kind = 'status_question'$$,
  '23514', 'Fleet intent approval is immutable', 'approval identity cannot change after approval'
);
select throws_ok(
  $$update private.fleet_intents set payload = '{"changed":true}' where kind = 'approve.deploy'$$,
  '23514', 'Fleet intent action is immutable', 'action parameters cannot change after submission'
);
savepoint owner_approval_binding;
select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('fa000000-0000-4000-8000-000000000004', 'fleet-steerer@example.com', now(), '{}', '{}');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select private.fleet_grant_access('fa000000-0000-4000-8000-000000000004',
  'steerer', array['approve.low'], array['fleet-test'], 'test_steerer');
update private.fleet_access_grants set intents_per_day = 2
  where user_id = 'fa000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('priority.set'), 'accepted', 'Observer can file a low-risk intent.request');
reset role;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000004"}', true);
select throws_ok(
  $$update private.fleet_intents set state = 'approved',
    approver_id = 'fa000000-0000-4000-8000-000000000004', approver_generation = 1
    where kind = 'priority.set'$$,
  '42501', 'Fleet Owner access required', 'a Steerer cannot approve an Observer intent.request'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$update private.fleet_intents set state = 'approved',
    approver_id = 'fa000000-0000-4000-8000-000000000004', approver_generation = 1
    where kind = 'priority.set'$$,
  '42501', 'Fleet Owner access required', 'the recorded approver must match the live Owner identity'
);
select lives_ok(
  $$update private.fleet_intents set state = 'approved', approver_id = auth.uid(), approver_generation = 2
    where kind = 'priority.set'$$,
  'the live Owner can approve the Observer request'
);
rollback to owner_approval_binding;

select lives_ok(
  $$update private.fleet_intents set state = 'cancelled' where kind = 'approve.deploy'$$,
  'pending intent can be cancelled'
);
select throws_ok(
  $$update private.fleet_intents set receipt = '{"changed":true}' where kind = 'approve.deploy'$$,
  '23514', 'Terminal Fleet intents are immutable', 'cancelled intent cannot change even without a state transition'
);

-- Load historical rows with the admission trigger paused inside this transaction.
alter table private.fleet_intents disable trigger fleet_admit_intent;
insert into private.fleet_intents (
  id, requester_id, channel, kind, payload, risk, action_hash, project_versions,
  requester_generation, stop_generation, state, idempotency_key, created_at, expires_at,
  lease_id, lease_expires_at
)
select id, 'fa000000-0000-4000-8000-000000000002', 'web', 'priority.set', '{}', 'low',
  decode(repeat('01', 32), 'hex'), '{"fleet-test":1}', 1, 2, state, gen_random_uuid(),
  now() - interval '73 hours', now() - interval '1 hour',
  case when state = 'claimed' then gen_random_uuid() end,
  case when state = 'claimed' then now() + interval '15 minutes' end
from (values
  ('fa000000-0000-4000-8000-000000000021'::uuid, 'pending_approval'::private.fleet_intent_state),
  ('fa000000-0000-4000-8000-000000000022'::uuid, 'approved'::private.fleet_intent_state),
  ('fa000000-0000-4000-8000-000000000025'::uuid, 'claimed'::private.fleet_intent_state)
) as historical(id, state);
alter table private.fleet_intents enable trigger fleet_admit_intent;
select throws_ok(
  $$update private.fleet_intents set state = 'approved',
    approver_id = 'fa000000-0000-4000-8000-000000000001', approver_generation = 2
    where id = 'fa000000-0000-4000-8000-000000000021'$$,
  '23514', 'Fleet intent has expired', 'an expired pending intent cannot be approved'
);
select throws_ok(
  $$update private.fleet_intents set state = 'claimed', lease_id = gen_random_uuid(),
    lease_expires_at = now() + interval '15 minutes'
    where id = 'fa000000-0000-4000-8000-000000000022'$$,
  '23514', 'Fleet intent has expired', 'an expired approved intent cannot be claimed'
);
select lives_ok(
  $$update private.fleet_intents set state = 'expired' where id in
    ('fa000000-0000-4000-8000-000000000021', 'fa000000-0000-4000-8000-000000000022')$$,
  'past-deadline intents can be marked expired'
);
select throws_ok(
  $$update private.fleet_intents set state = 'dispatched'
    where id = 'fa000000-0000-4000-8000-000000000025'$$,
  '23514', 'Fleet intent has expired', 'a live lease cannot dispatch an expired intent'
);
update private.fleet_projects set name_en = 'Fleet label edit' where key = 'fleet-test';
select is((select target_mapping_version from private.fleet_projects where key = 'fleet-test'),
  1::bigint, 'display-name edits preserve mapping version');
update private.fleet_projects set target_mapping = '{"lane":"fixture"}' where key = 'fleet-test';
select is((select target_mapping_version from private.fleet_projects where key = 'fleet-test'),
  2::bigint, 'target remapping increments the project version');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select is(private.fleet_revoke_access('fa000000-0000-4000-8000-000000000002', 'test_revoke'),
  2::bigint, 'revocation advances the requester generation');
select is(private.fleet_revoke_access('fa000000-0000-4000-8000-000000000002', 'test_revoke'),
  2::bigint, 'repeating revocation preserves the fence');
select throws_ok($$select private.fleet_set_stopped(true, null)$$,
  '23502', null, 'stop fails if its audit event cannot be inserted');
select is(private.fleet_set_stopped(true, 'test_stop'),
  3::bigint, 'stop advances the control generation');
select throws_ok($$delete from private.fleet_control$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'the stopped control row cannot be deleted');
select throws_ok($$truncate private.fleet_control$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'control truncation cannot reset stop');
select throws_ok($$insert into private.fleet_control default values$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'control recreation is fenced');
select is((select generation from private.fleet_control where stopped),
  3::bigint, 'reset attempts preserve the stop state and generation');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('status_question'), 'fleet_stopped', 'stop blocks submissions');
reset role;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select is(private.fleet_set_stopped(false, 'test_resume'),
  4::bigint, 'resume advances the control generation again');
select is((select array_agg(action order by id) from private.fleet_audit_events where action <> 'intent.submit'),
  array['access.grant', 'access.revoke', 'access.revoke', 'fleet.stop', 'fleet.resume'],
  'every successful Owner operation has an audit event');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('status_question'), 'inactive_grant', 'revocation remains enforced after resume');
reset role;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
    'steerer', array['approve.deploy'], array['fleet-test'], 'test_regrant')$$,
  '23514', 'Capabilities exceed the Fleet tier ceiling', 're-grant applies the tier ceiling'
);
select is(private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
  'steerer', array['ask', 'approve.low', 'work.create', 'intent.request'], array['fleet-test'],
  'test_regrant', null, 3, 10), 3::bigint, 're-grant advances the generation');
select ok((select revoked_at is null from private.fleet_access_grants
  where user_id = 'fa000000-0000-4000-8000-000000000002'), 're-grant clears revocation');

savepoint expired_grant;
update private.fleet_access_grants set expires_at = now() - interval '1 hour'
  where user_id = 'fa000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('status_question', '{"fleet-test":2}'),
  'inactive_grant', 'an expired grant cannot submit an intent');
reset role;
rollback to expired_grant;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(pg_temp.submit_fleet('work.create', '{"fleet-test":2}'),
  'accepted', 'a Steerer can submit work.create within their limits');
select is(pg_temp.submit_fleet('work.redirect', '{"fleet-test":2}'),
  'accepted', 'a Steerer can request work.redirect through intent.request');
reset role;
select ok((select state = 'approved' and approver_id = requester_id
    and approver_generation = requester_generation and requester_generation = 3
  from private.fleet_intents where kind = 'work.create'),
  'a capability with approve.low records self-approval at the current generation');
select ok((select state = 'pending_approval' and requires_owner_approval
  and approver_id is null from private.fleet_intents where kind = 'work.redirect'),
  'intent.request still waits for the Owner even with approve.low');

insert into private.fleet_intents (
  id, requester_id, channel, kind, payload, action_hash, project_versions, state,
  approver_id, approver_generation, lease_id, lease_expires_at, receipt, idempotency_key
) values (
  'fa000000-0000-4000-8000-000000000023', 'fa000000-0000-4000-8000-000000000002',
  'web', 'lane.pause', '{}', decode(repeat('01', 32), 'hex'), '{"fleet-test":2}', 'dispatched',
  'fa000000-0000-4000-8000-000000000001', 4, gen_random_uuid(), now() + interval '15 minutes',
  '{"result":"forged"}', 'fa000000-0000-4000-8000-000000000024'
);
select ok((select state = 'pending_approval' and approver_id is null and approver_generation is null
  and lease_id is null and lease_expires_at is null and receipt is null
  and idempotency_key <> 'fa000000-0000-4000-8000-000000000024'
  from private.fleet_intents where id = 'fa000000-0000-4000-8000-000000000023'),
  'admission replaces caller-supplied decision, lease, receipt and idempotency fields');
select lives_ok(
  $$update private.fleet_intents set state = 'claimed', lease_id = gen_random_uuid(),
    lease_expires_at = now() + interval '15 minutes' where kind = 'work.create'$$,
  'an approved live intent can be claimed with a lease'
);
select throws_ok(
  $$update private.fleet_intents set state = 'dispatched', lease_id = null, lease_expires_at = null
    where kind = 'work.create'$$,
  '23514', null, 'dispatch requires a lease'
);
savepoint expired_lease;
update private.fleet_intents set lease_expires_at = now() - interval '1 minute' where kind = 'work.create';
select throws_ok(
  $$update private.fleet_intents set state = 'dispatched', lease_expires_at = now() + interval '15 minutes'
    where kind = 'work.create'$$,
  '23514', 'Fleet dispatch requires an unexpired lease', 'dispatch cannot revive an expired lease'
);
rollback to expired_lease;
select lives_ok(
  $$update private.fleet_intents set state = 'dispatched' where kind = 'work.create'$$,
  'dispatch accepts a live intent with a live lease'
);
select throws_ok(
  $$delete from private.fleet_intents where kind = 'work.create'$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'intent deletion cannot erase quota usage');
select throws_ok($$truncate private.fleet_intents cascade$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'truncation cannot erase approval history');

select throws_ok(
  $$delete from private.fleet_access_grants where user_id = 'fa000000-0000-4000-8000-000000000002'$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'grant identity cannot be deleted');
select throws_ok($$truncate private.fleet_access_grants cascade$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'grant generations survive cascading truncate attempts');
select throws_ok($$delete from private.fleet_projects where key = 'fleet-test'$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'project mapping version cannot be deleted');
select throws_ok($$truncate private.fleet_projects cascade$$,
  '55000', 'Fleet fence rows cannot be removed or replaced', 'mapping versions survive cascading truncate attempts');
select set_config('request.jwt.claims', '{}', true);
delete from auth.users where id = 'fa000000-0000-4000-8000-000000000002';
select ok((select auth_user_id is null and revoked_at is not null and generation = 4
  from private.fleet_access_grants where user_id = 'fa000000-0000-4000-8000-000000000002'),
  'Auth deletion revokes the permanent grant and advances its generation');
select is((select requester_generation from private.fleet_intents where kind = 'work.create'),
  3::bigint, 'Auth deletion preserves the historical requester fence');
delete from public.workspaces where personal and creator_id = 'fa000000-0000-4000-8000-000000000002';
delete from public.users where id = 'fa000000-0000-4000-8000-000000000002';
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('fa000000-0000-4000-8000-000000000002', 'fleet-grantee@example.com', now(), '{}', '{}');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select is(private.fleet_grant_access('fa000000-0000-4000-8000-000000000002',
  'observer', array['ask'], array['fleet-test'], 'test_recreated_user'),
  5::bigint, 'recreating an account with the same UUID cannot reuse a grant generation');

select set_config('request.jwt.claims', '{}', true);
select private.revoke_mastermind_access('fa000000-0000-4000-8000-000000000001', 'Fleet SQL fixture');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select private.fleet_set_stopped(true, 'test_stop')$$,
  '42501', 'Fleet Owner access required', 'root permission revocation removes Owner authority immediately'
);
select throws_ok(
  $$update private.fleet_audit_events set reason_code = 'changed'$$,
  '55000', 'Fleet audit events are append-only', 'audit UPDATE is rejected'
);
select throws_ok($$delete from private.fleet_audit_events$$,
  '55000', 'Fleet audit events are append-only', 'audit DELETE is rejected');
select throws_ok($$truncate private.fleet_audit_events$$,
  '55000', 'Fleet audit events are append-only', 'audit TRUNCATE is rejected');

select * from finish();
rollback;
