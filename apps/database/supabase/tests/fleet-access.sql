begin;
select plan(46);

select is((select count(*) from private.fleet_access_grants), 0::bigint, 'no Fleet grants are seeded');
select ok((select owner_user_id is null from private.fleet_control), 'Fleet Owner is unconfigured');
select is(
  (select count(*) from pg_class where relnamespace = 'private'::regnamespace
    and relkind = 'r' and relname like 'fleet\_%' and relrowsecurity),
  8::bigint, 'all Fleet tables have RLS enabled'
);
select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as privilege
  where c.relnamespace = 'private'::regnamespace and c.relkind = 'r' and c.relname like 'fleet\_%'
    and has_table_privilege(caller, c.oid, privilege)
), 'API roles have no direct Fleet table privileges');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname like 'fleet\_%'
    and (p.proname <> 'fleet_submit_intent' or caller <> 'service_role')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'only the service submission function is executable by API roles');

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
select is(pg_temp.submit_fleet('status_question', '{"fleet-test":2}'),
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
select throws_ok(
  $$update private.fleet_intents set approver_id = requester_id where kind = 'status_question'$$,
  '23514', 'Fleet intent approval is immutable', 'approval identity cannot change after approval'
);
select throws_ok(
  $$update private.fleet_intents set payload = '{"changed":true}' where kind = 'approve.deploy'$$,
  '23514', 'Fleet intent action is immutable', 'action parameters cannot change after submission'
);
select lives_ok(
  $$update private.fleet_intents set state = 'cancelled' where kind = 'approve.deploy'$$,
  'pending intent can be cancelled'
);
select throws_ok(
  $$update private.fleet_intents set state = 'pending_approval' where kind = 'approve.deploy'$$,
  '23514', 'Invalid Fleet intent state transition', 'cancelled intent cannot be reopened'
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
