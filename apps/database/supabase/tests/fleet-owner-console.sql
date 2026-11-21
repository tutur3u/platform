begin;
select plan(74);

create temporary table fleet_owner_definers (signature regprocedure);
insert into fleet_owner_definers values
  ('private.fleet_owner_list_access(uuid)'),
  ('private.fleet_owner_grant_access(uuid,text,private.fleet_tier,text[],text[],timestamptz,integer,integer,bigint,bigint)'),
  ('private.fleet_owner_revoke_access(uuid,uuid,bigint)'),
  ('private.fleet_owner_set_stopped(uuid,boolean,bigint)'),
  ('private.fleet_owner_upsert_project(uuid,text,text,text)'),
  ('private.fleet_owner_set_display_value(uuid,text,text,text,boolean)');

select is(
  (select count(*) from fleet_owner_definers d join pg_proc p on p.oid = d.signature
    where p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, pg_temp']
      and p.proacl::text[] = array['postgres=X/postgres', 'service_role=X/postgres']),
  6::bigint, 'Owner console definers pin search_path and admit only the service role'
);
select is(
  (select count(*) from pg_proc p
    where p.oid in ('private.fleet_owner_actor(uuid)'::regprocedure,
      'private.fleet_owner_instant(timestamptz)'::regprocedure)
      and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, pg_temp']
      and p.proacl::text[] = array['postgres=X/postgres']),
  2::bigint, 'Owner console helpers are internal invokers with no API grant'
);
select ok(not exists (
  select 1 from fleet_owner_definers d
  cross join unnest(array['public', 'anon', 'authenticated']) as caller
  where has_function_privilege(caller, d.signature, 'EXECUTE')
), 'browser roles cannot call the Owner console');
select ok(not exists (
  select 1 from pg_proc p
  where p.oid in (
    'private.fleet_require_owner()'::regprocedure,
    'private.fleet_grant_access(uuid,private.fleet_tier,text[],text[],text,timestamptz,integer,integer,bigint)'::regprocedure,
    'private.fleet_revoke_access(uuid,text)'::regprocedure,
    'private.fleet_set_stopped(boolean,text)'::regprocedure
  ) and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'the database-owner management functions stay closed to the service role');

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('fd000000-0000-4000-8000-000000000001', 'fleet-console-owner@example.com', now(), '{}', '{}'),
  ('fd000000-0000-4000-8000-000000000002', 'Fleet-Console-Grantee@example.com', now(), '{}', '{}'),
  ('fd000000-0000-4000-8000-000000000003', 'fleet-console-root@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('00000000-0000-0000-0000-000000000000', 'Fleet console root',
    'fd000000-0000-4000-8000-000000000001', false)
  on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-4000-8000-000000000003', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;
insert into private.fleet_projects (key, name_en, name_vi)
  values ('console-test', 'Console test', 'Kiểm thử bảng điều khiển');
select private.revoke_mastermind_access(user_id, 'Fleet console fixture')
  from public.workspace_role_members
  where role_id = (select role_id from private.mastermind_access_role);
update private.fleet_control set owner_user_id = 'fd000000-0000-4000-8000-000000000001', stopped = false;

create function pg_temp.owner(p_call text, p_actor uuid default 'fd000000-0000-4000-8000-000000000001')
returns jsonb language plpgsql as $$
declare
  v_result jsonb;
begin
  execute format(p_call, quote_literal(p_actor)) into v_result;
  return v_result;
end;
$$;
create function pg_temp.grant_jsonb(p_actor uuid, p_tier private.fleet_tier, p_capabilities text[],
  p_projects text[] default array['console-test'], p_expected bigint default null,
  p_email text default 'fleet-console-grantee@example.com')
returns jsonb language sql as $$
  select private.fleet_owner_grant_access(p_actor, p_email, p_tier, p_capabilities, p_projects,
    now() + interval '7 days', 20, 5, 0, p_expected);
$$;

-- Owner checks.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select private.fleet_owner_list_access('fd000000-0000-4000-8000-000000000001')$$,
  '42501', 'Fleet Owner access required', 'the configured root creator without an explicit grant is refused'
);
reset role;
-- The Mastermind role has one member: first a root manager other than the Owner.
select private.grant_mastermind_access('fd000000-0000-4000-8000-000000000003', 'Fleet console fixture');
set local role service_role;
select throws_ok(
  $$select private.fleet_owner_list_access('fd000000-0000-4000-8000-000000000003')$$,
  '42501', 'Fleet Owner access required', 'a root manager who is not the configured Owner is refused'
);
select throws_ok(
  $$select private.fleet_owner_list_access('fd000000-0000-4000-8000-000000000001')$$,
  '42501', 'Fleet Owner access required', 'the configured Owner needs the explicit grant'
);
reset role;
select private.revoke_mastermind_access('fd000000-0000-4000-8000-000000000003', 'Fleet console fixture');
select private.grant_mastermind_access('fd000000-0000-4000-8000-000000000001', 'Fleet console fixture');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"fd000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select private.fleet_owner_list_access('fd000000-0000-4000-8000-000000000001')$$,
  '42501', 'Trusted Fleet Owner request required', 'a non-service request context is refused'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select private.fleet_owner_list_access(null)$$,
  '42501', 'Trusted Fleet Owner request required', 'a missing actor is refused'
);
select throws_ok(
  $$select private.fleet_owner_list_access('fd000000-0000-4000-8000-000000000002')$$,
  '42501', 'Fleet Owner access required', 'a non-Owner is refused'
);
select throws_ok(
  $$select pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000003', 'observer', array['status.read'])$$,
  '42501', 'Fleet Owner access required', 'Owner-on-another-ID cannot grant'
);
select throws_ok(
  $$select private.fleet_owner_set_stopped('fd000000-0000-4000-8000-000000000002', true, 1)$$,
  '42501', 'Fleet Owner access required', 'a non-Owner cannot stop Fleet'
);
select throws_ok(
  $$select private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000002', 'x', 'X', 'X')$$,
  '42501', 'Fleet Owner access required', 'a non-Owner cannot edit the catalog'
);
select throws_ok(
  $$select private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000002',
    'console-test', 'lane', 'Lane', true)$$,
  '42501', 'Fleet Owner access required', 'a non-Owner cannot approve display values'
);
select throws_ok(
  $$select private.fleet_owner_revoke_access('fd000000-0000-4000-8000-000000000003',
    'fd000000-0000-4000-8000-000000000002', 1)$$,
  '42501', 'Fleet Owner access required', 'Owner-on-another-ID cannot revoke'
);
reset role;
select is((select count(*) from private.fleet_audit_events
  where actor_id in ('fd000000-0000-4000-8000-000000000002', 'fd000000-0000-4000-8000-000000000003')),
  0::bigint, 'refused callers leave no audit rows or writes');

-- Grants and the tier ceiling.
set local role service_role;
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer', array['status.read'],
    p_email => 'nobody@example.com') ->> 'result',
  'unknown_user', 'an unknown email is refused');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer',
    array['status.read', 'approve.low']) ->> 'result',
  'invalid_grant', 'an Observer cannot hold a Steerer capability');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'operator',
    array['approve.migration']) ->> 'result',
  'invalid_grant', 'an Operator cannot hold an Owner capability');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'owner', array['status.read']) ->> 'result',
  'invalid_grant', 'the Owner tier cannot be granted');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer', array['status.read'],
    array['missing-project']) ->> 'result',
  'unknown_project', 'projects come from the catalog');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer', array['status.read'],
    array[]::text[]) ->> 'result',
  'invalid_grant', 'a grant needs projects');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer', array['status.read'],
    array['console-test', 'console-test']) ->> 'result',
  'invalid_grant', 'duplicate projects are refused');
select is(private.fleet_owner_grant_access('fd000000-0000-4000-8000-000000000001',
    'fleet-console-grantee@example.com', 'observer', array['status.read'], array['console-test'],
    now() - interval '1 minute', 20, 5, 0) ->> 'result',
  'invalid_grant', 'a past expiry is refused');
select is(private.fleet_owner_grant_access('fd000000-0000-4000-8000-000000000001',
    'fleet-console-grantee@example.com', 'observer', array['status.read'], array['console-test'],
    null, -1, 5, 0) ->> 'result',
  'invalid_grant', 'negative caps are refused');
reset role;
select is((select count(*) from private.fleet_access_grants
  where user_id = 'fd000000-0000-4000-8000-000000000002'), 0::bigint, 'refused grants write nothing');

set local role service_role;
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer',
    array['status.read', 'ask']),
  '{"result":"granted","userId":"fd000000-0000-4000-8000-000000000002","generation":"1"}'::jsonb,
  'the Owner grants by case-insensitive email');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'steerer', array['comment']) ->> 'result',
  'grant_exists', 'a new grant cannot replace a live grant');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'steerer', array['comment'],
    p_expected => 7) ->> 'result',
  'generation_changed', 'an edit of a stale generation is refused');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'steerer',
    array['status.read', 'comment', 'approve.low'], p_expected => 1),
  '{"result":"updated","userId":"fd000000-0000-4000-8000-000000000002","generation":"2"}'::jsonb,
  'an edit of the current generation replaces the grant');
select is(private.fleet_get_access('fd000000-0000-4000-8000-000000000002'),
  '{"enabled":true,"tier":"steerer","projects":["console-test"],"capabilities":["status.read","comment","approve.low"],"stopped":false}'::jsonb,
  'the grantee sees the edited grant on the next request');
select is(
  pg_temp.owner($$select jsonb_path_query_first(private.fleet_owner_list_access(%s),
    '$.grants[*] ? (@.userId == "fd000000-0000-4000-8000-000000000002")') - 'expiresAt'$$),
  '{"userId":"fd000000-0000-4000-8000-000000000002","email":"Fleet-Console-Grantee@example.com",
    "tier":"steerer","capabilities":["status.read","comment","approve.low"],"projects":["console-test"],
    "revokedAt":null,"status":"active","generation":"2","questionsPerHour":20,"intentsPerDay":5,
    "modelBudgetPerMonth":0}'::jsonb,
  'the Owner reads the grant with person, scope, status and generation'
);
reset role;
select ok((select owner_change ->> 'tier' = 'steerer' and owner_change ->> 'generation' = '2'
  from private.fleet_audit_events where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'access.grant' and reason_code = 'updated'),
  'the audit row records the applied grant');
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'access.grant'),
  array['unknown_user', 'invalid_grant', 'invalid_grant', 'invalid_grant', 'unknown_project',
    'invalid_grant', 'invalid_grant', 'invalid_grant', 'invalid_grant', 'granted', 'grant_exists',
    'generation_changed', 'updated'],
  'every grant attempt is audited with its outcome');
select ok(not exists (select 1 from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'access.grant' and reason_code not in ('granted', 'updated') and owner_change is not null),
  'refused grants record no applied change');

-- Revocation takes effect on the next request.
set local role service_role;
select is(private.fleet_owner_revoke_access('fd000000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000002', 1) ->> 'result',
  'generation_changed', 'a revoke of a stale generation is refused');
select is(private.fleet_owner_revoke_access('fd000000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000003', 1) ->> 'result',
  'not_found', 'a revoke without a grant is refused');
select is(private.fleet_owner_revoke_access('fd000000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000002', 2),
  '{"result":"revoked","generation":"3"}'::jsonb, 'the Owner revokes the current generation');
select is(private.fleet_get_access('fd000000-0000-4000-8000-000000000002') -> 'enabled',
  'false'::jsonb, 'a revoked grant is disabled on the next request');
select is(private.fleet_owner_revoke_access('fd000000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000002', 3) ->> 'result',
  'already_revoked', 'a second revoke changes nothing');
select is(pg_temp.owner($$select jsonb_path_query_first(private.fleet_owner_list_access(%s),
    '$.grants[*] ? (@.userId == "fd000000-0000-4000-8000-000000000002").status')$$) #>> '{}',
  'revoked', 'the Owner reads the revoked status');
select is(pg_temp.grant_jsonb('fd000000-0000-4000-8000-000000000001', 'observer', array['status.read']) ->> 'result',
  'updated', 'a revoked person can be granted again');
select is(private.fleet_get_access('fd000000-0000-4000-8000-000000000002') -> 'tier',
  '"observer"'::jsonb, 'the new grant is live');
reset role;
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'access.revoke'),
  array['generation_changed', 'not_found', 'revoked', 'already_revoked'],
  'every revoke attempt is audited');

-- Stop and resume.
set local role service_role;
select is(private.fleet_owner_set_stopped('fd000000-0000-4000-8000-000000000001', true, 0) ->> 'result',
  'generation_changed', 'a stop of a stale generation is refused');
select is(private.fleet_owner_set_stopped('fd000000-0000-4000-8000-000000000001', true,
    (pg_temp.owner($$select private.fleet_owner_list_access(%s) -> 'generation'$$) #>> '{}')::bigint) ->> 'result',
  'stopped', 'the Owner stops Fleet');
select is(private.fleet_get_access('fd000000-0000-4000-8000-000000000002') -> 'stopped',
  'true'::jsonb, 'grantees see the stop on the next request');
select is(pg_temp.owner($$select private.fleet_owner_list_access(%s) -> 'stopped'$$),
  'true'::jsonb, 'the Owner console stays available while stopped');
select is(private.fleet_owner_set_stopped('fd000000-0000-4000-8000-000000000001', true,
    (pg_temp.owner($$select private.fleet_owner_list_access(%s) -> 'generation'$$) #>> '{}')::bigint) ->> 'result',
  'unchanged', 'stopping a stopped Fleet changes nothing');
select is(private.fleet_owner_set_stopped('fd000000-0000-4000-8000-000000000001', false,
    (pg_temp.owner($$select private.fleet_owner_list_access(%s) -> 'generation'$$) #>> '{}')::bigint) ->> 'result',
  'resumed', 'the Owner resumes Fleet');
select is(private.fleet_get_access('fd000000-0000-4000-8000-000000000002') -> 'enabled',
  'true'::jsonb, 'grantees regain access after resume');
reset role;
select is((select array_agg(action || ':' || reason_code order by id) from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action in ('fleet.stop', 'fleet.resume')),
  array['fleet.stop:generation_changed', 'fleet.stop:stopped', 'fleet.stop:unchanged', 'fleet.resume:resumed'],
  'stop and resume attempts are audited');

-- Catalog.
set local role service_role;
select is(private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000001',
    'console-new', 'New project', 'Dự án mới') ->> 'result',
  'created', 'the Owner adds a catalog project');
select is(private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000001',
    'console-test', ' Console renamed ', 'Đã đổi tên') ->> 'result',
  'updated', 'the Owner renames a catalog project');
select is(private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000001',
    'Bad Key', 'Bad', 'Sai') ->> 'result',
  'invalid_project', 'catalog keys keep their syntax');
select is(private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000001',
    'console-blank', ' ', 'Trống') ->> 'result',
  'invalid_project', 'catalog names are required');
select is(private.fleet_owner_upsert_project('fd000000-0000-4000-8000-000000000001',
    'console-long', repeat('x', 81), 'Dài') ->> 'result',
  'invalid_project', 'catalog names are bounded');
reset role;
select ok((select name_en = 'Console renamed' and target_mapping_version = 1
  from private.fleet_projects where key = 'console-test'),
  'a rename trims names and keeps the target mapping version');
select is((select count(*) from private.fleet_projects where key in ('console-blank', 'console-long')),
  0::bigint, 'refused catalog rows are not written');

-- Display values.
set local role service_role;
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'lane', 'Release lane', true) ->> 'result',
  'approved', 'the Owner approves a lane value');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'lane', 'Release lane', true) ->> 'result',
  'unchanged', 'a repeated approval changes nothing');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'releaseTitle', ' padded', true) ->> 'result',
  'invalid_value', 'display values keep their syntax');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'owner', 'Value', true) ->> 'result',
  'invalid_value', 'display fields are fixed');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'missing-project', 'lane', 'Value', true) ->> 'result',
  'unknown_project', 'display values belong to catalog projects');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'readinessItem', 'Security review', true) ->> 'result',
  'approved', 'the Owner approves a readiness item');
select is(
  pg_temp.owner($$select jsonb_path_query_first(private.fleet_owner_list_access(%s),
    '$.projects[*] ? (@.key == "console-test")')$$),
  '{"key":"console-test","nameEn":"Console renamed","nameVi":"Đã đổi tên","displayValues":
    {"lane":["Release lane"],"releaseTitle":[],"readinessItem":["Security review"]}}'::jsonb,
  'the Owner reads the catalog with its display values'
);
select is(private.fleet_publish_digest('console-test', now(),
    '[{"lane":"Release lane","state":"ready","readinessItem":"Security review","blockerCodes":[]}]'),
  'published', 'approved values publish');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'readinessItem', 'Security review', false) ->> 'result',
  'removed', 'the Owner removes an approval');
select is(private.fleet_owner_set_display_value('fd000000-0000-4000-8000-000000000001',
    'console-test', 'readinessItem', 'Security review', false) ->> 'result',
  'unchanged', 'removing a missing approval changes nothing');
select is(private.fleet_get_digest('fd000000-0000-4000-8000-000000000002'), '[]'::jsonb,
  'a removed approval hides the stored snapshot');
reset role;
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'catalog.upsert'),
  array['created', 'updated', 'invalid_project', 'invalid_project', 'invalid_project'],
  'catalog attempts are audited');
select is((select array_agg(reason_code order by id) from private.fleet_audit_events
  where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'display.set'),
  array['approved', 'unchanged', 'invalid_value', 'invalid_value', 'unknown_project', 'approved',
    'removed', 'unchanged'],
  'display value attempts are audited');
select ok((select owner_change = '{"projectKey":"console-test","field":"lane","value":"Release lane"}'::jsonb
  from private.fleet_audit_events where actor_id = 'fd000000-0000-4000-8000-000000000001' and action = 'display.set' order by id limit 1),
  'display audit rows record the project, field and value');
select ok(not exists (select 1 from private.fleet_audit_events
  where created_at = now()
    and action in ('access.grant', 'access.revoke', 'fleet.stop', 'fleet.resume', 'catalog.upsert', 'display.set')
    and (actor_id is distinct from 'fd000000-0000-4000-8000-000000000001' or channel <> 'web')),
  'every Owner console audit row names the Owner on the web channel');

select * from finish();
rollback;
