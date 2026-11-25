-- Runtime feature flag rule store (20261125030000, 20261125030100, 20261125080000): client
-- isolation, service-role-only RPCs, definition sync, shape validation that
-- matches ruleMutationError (packages/feature-flags/src/rule-store-contract.test.ts
-- binds each 'shape: <name>' row to the TypeScript table), controller
-- authorization, compare-and-swap, replay, unset, append-only audits, control
-- widening, subject erasure, read paging and the subject rule caps.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(132);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('5ff00000-0000-4000-8000-000000000001', 'ff-root-creator@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000002', 'ff-root-admin@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000003', 'ff-root-viewer@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000004', 'ff-ws-creator@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000005', 'ff-ws-member@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000006', 'ff-self@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000007', 'ff-root-member-admin@example.com', now(), '{}', '{}'),
  ('5ff00000-0000-4000-8000-000000000008', 'ff-guest@example.com', now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-0000-0000-000000000000', 'Root', false, '5ff00000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('5ff00000-0000-4000-8000-0000000000a1', 'FF tenant', false, '5ff00000-0000-4000-8000-000000000004'),
  ('5ff00000-0000-4000-8000-0000000000a2', 'FF other tenant', false, '5ff00000-0000-4000-8000-000000000001');
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-000000000002', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-000000000003', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-000000000007', 'MEMBER'),
  ('5ff00000-0000-4000-8000-0000000000a1', '5ff00000-0000-4000-8000-000000000005', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_members (ws_id, user_id, type) values
  ('5ff00000-0000-4000-8000-0000000000a1', '5ff00000-0000-4000-8000-000000000008', 'GUEST')
on conflict (ws_id, user_id) do update set type = 'GUEST';
insert into public.workspace_roles (id, ws_id, name) values
  ('5ff00000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'FF managers'),
  ('5ff00000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'FF viewers'),
  ('5ff00000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'FF root admins'),
  ('5ff00000-0000-4000-8000-0000000000c4', '5ff00000-0000-4000-8000-0000000000a1', 'Tenant flag managers');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-0000000000c1', 'manage_feature_flags', true),
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-0000000000c2', 'view_infrastructure', true),
  ('00000000-0000-0000-0000-000000000000', '5ff00000-0000-4000-8000-0000000000c3', 'admin', true),
  ('5ff00000-0000-4000-8000-0000000000a1', '5ff00000-0000-4000-8000-0000000000c4', 'manage_feature_flags', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('5ff00000-0000-4000-8000-0000000000c1', '5ff00000-0000-4000-8000-000000000002'),
  ('5ff00000-0000-4000-8000-0000000000c2', '5ff00000-0000-4000-8000-000000000003'),
  ('5ff00000-0000-4000-8000-0000000000c3', '5ff00000-0000-4000-8000-000000000007'),
  ('5ff00000-0000-4000-8000-0000000000c4', '5ff00000-0000-4000-8000-000000000005');

-- Runs one statement under a role; returns 'ok' or the SQLSTATE it raised.
create function pg_temp.as_role(p_sql text, p_role text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- Calls one service-role RPC expression; returns its jsonb or {"error": message}.
create function pg_temp.rpc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  begin
    execute 'select ' || p_sql into r;
  exception when others then r := jsonb_build_object('error', sqlerrm, 'state', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- feature_flag_mutate_rule as service_role; returns the status or the error.
-- Without p_keep the write is rolled back, so probes leave no state.
create function pg_temp.try_rule(
  p_actor uuid, p_op uuid, p_flag text, p_env text, p_scope text, p_subject uuid,
  p_mode text, p_pct integer, p_ws uuid[], p_users uuid[], p_rev bigint,
  p_reason text, p_client text, p_keep boolean default false
) returns text language plpgsql as $$
declare r jsonb;
begin
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
    r := private.feature_flag_mutate_rule(p_actor, p_op, p_flag, p_env, p_scope,
      p_subject, p_mode, p_pct, p_ws, p_users, p_rev, p_reason, p_client);
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    if not p_keep then raise exception 'probe_rollback'; end if;
  exception when others then
    if sqlerrm = 'probe_rollback' then return r ->> 'status'; end if;
    return sqlerrm;
  end;
  return r ->> 'status';
end $$;

-- Shorthand for a probe by the root flag manager on FF_RULE_TEST production.
create function pg_temp.probe(
  p_flag text, p_env text, p_scope text, p_subject uuid, p_mode text,
  p_pct integer, p_ws uuid[], p_users uuid[], p_rev bigint, p_reason text, p_client text
) returns text language sql as $$
  select pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002',
    gen_random_uuid(), p_flag, p_env, p_scope, p_subject, p_mode, p_pct, p_ws,
    p_users, p_rev, p_reason, p_client);
$$;

-- Privileges ------------------------------------------------------------------

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role),
       unnest(array['private.feature_flag_definitions', 'private.feature_flag_rules',
         'private.feature_flag_audit', 'private.feature_flag_definition_audit']) as t(name),
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
  where has_table_privilege(r.role, t.name, p.priv)
), 'no client or service role has table privileges on the rule store');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated']) as r(role),
       unnest(array[
         'private.feature_flag_sync_definitions(jsonb,boolean)',
         'private.feature_flag_mutate_rule(uuid,uuid,text,text,text,uuid,text,integer,uuid[],uuid[],bigint,text,text)',
         'private.feature_flag_read_snapshot(text)',
         'private.feature_flag_read_rules(uuid,text,text,integer,text,text,uuid)',
         'private.feature_flag_read_audit(uuid,integer,timestamptz,uuid)',
         'private.feature_flag_read_subject_rules(text,uuid,uuid)',
         'private.feature_flag_erase_subject(text,uuid)'
       ]) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'anon and authenticated cannot execute the rule store RPCs');
select ok((
  select bool_and(has_function_privilege('service_role', f.fn, 'EXECUTE'))
  from unnest(array[
    'private.feature_flag_sync_definitions(jsonb,boolean)',
    'private.feature_flag_mutate_rule(uuid,uuid,text,text,text,uuid,text,integer,uuid[],uuid[],bigint,text,text)',
    'private.feature_flag_read_snapshot(text)',
    'private.feature_flag_read_rules(uuid,text,text,integer,text,text,uuid)',
    'private.feature_flag_read_audit(uuid,integer,timestamptz,uuid)',
    'private.feature_flag_read_subject_rules(text,uuid,uuid)',
    'private.feature_flag_erase_subject(text,uuid)'
  ]) as f(fn)
), 'service_role can execute the rule store RPCs');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role),
       unnest(array[
         'private.feature_flag_rule_shape_error(text,uuid,text,integer,uuid[],uuid[])',
         'private.feature_flag_definition_error(text,text,text[],jsonb,text)',
         'private.feature_flag_require_root(uuid,text[])',
         'private.feature_flag_rule_json(text,integer,uuid[],uuid[])',
         'private.feature_flag_guard_write()',
         'private.feature_flag_require_service_role()',
         'private.feature_flag_live_rule_json(private.feature_flag_rules)',
         'private.feature_flag_erase_json(jsonb,text,text)'
       ]) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'internal helpers have no client or service grant');
select is(pg_temp.as_role($q$select private.feature_flag_read_snapshot('production')$q$,
  'authenticated'), '42501', 'an authenticated client cannot read the snapshot');

-- Permission fixture preconditions ---------------------------------------------

select ok(public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
  '5ff00000-0000-4000-8000-000000000002', 'manage_feature_flags'), 'the root flag manager holds manage_feature_flags');
select ok(not public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
  '5ff00000-0000-4000-8000-000000000003', 'manage_feature_flags'), 'the root viewer lacks manage_feature_flags');
select ok(not public.has_workspace_permission('5ff00000-0000-4000-8000-0000000000a1',
  '5ff00000-0000-4000-8000-000000000005', 'manage_workspace_settings'), 'the tenant member lacks manage_workspace_settings');
select ok(public.has_workspace_permission('5ff00000-0000-4000-8000-0000000000a1',
  '5ff00000-0000-4000-8000-000000000005', 'manage_feature_flags'), 'the tenant member holds a tenant-level manage_feature_flags');
select is((select count(*)::int from private.feature_flag_definition_audit), 0, 'no definition audit before the first sync');

-- Definitions ---------------------------------------------------------------------

select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[
  {"key":"FF_RULE_TEST","kind":"release","scopes":["platform","workspace","user"],
   "controllers":{"platform":"platform-admin","workspace":"workspace-admin","user":"self"},"delegate":null},
  {"key":"FF_RULE_PLATFORM_ONLY","kind":"kill-switch","scopes":["platform"],
   "controllers":{"platform":"platform-admin"}},
  {"key":"FF_RULE_ADMIN_USER","kind":"release","scopes":["platform","workspace","user"],
   "controllers":{"platform":"platform-admin","workspace":"platform-admin","user":"platform-admin"},
   "delegate":"workspace"}
]'::jsonb)$q$) ->> 'definitions', '3', 'service_role syncs the runtime definitions');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_RULE_TEST","kind":"release",
  "scopes":["platform","workspace","user"],"controllers":{"platform":"platform-admin",
  "workspace":"workspace-admin","user":"self"},"delegate":null}]'::jsonb)$q$) ->> 'changed', '0',
  'an unchanged definition sync is a no-op');
select is((select count(*)::int from private.feature_flag_definition_audit where old_definition is null), 3,
  'each new definition has one definition audit row');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_BAD","kind":"release",
  "scopes":["platform"],"controllers":{"platform":"platform-admin"},"delegate":"workspace"}]'::jsonb)$q$) ->> 'error',
  'feature_flag_invalid_definition_delegate', 'a delegate without the workspace scope is refused');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_BAD","kind":"release",
  "scopes":["platform"],"controllers":{"platform":"self"}}]'::jsonb)$q$) ->> 'error',
  'feature_flag_invalid_definition_controllers', 'a self-controlled platform scope is refused');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_BAD","kind":"release",
  "scopes":["platform"],"controllers":{"platform":"platform-admin"}},{"key":"FF_BAD","kind":"release",
  "scopes":["platform"],"controllers":{"platform":"platform-admin"}}]'::jsonb)$q$) ->> 'error',
  'feature_flag_duplicate_definition', 'a duplicated definition is refused');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_BAD","kind":"release",
  "scopes":"platform","controllers":{"platform":"platform-admin"}}]'::jsonb)$q$) ->> 'error',
  'feature_flag_invalid_definitions', 'a non-list scope is refused');
select is((select count(*)::int from private.feature_flag_definitions where flag_key = 'FF_BAD'), 0,
  'refused definitions write nothing');

-- Shape validation (mirrors rule-store-contract.test.ts) -----------------------------

select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'applied', 'shape: valid platform rule');
select is(pg_temp.probe('FF_RULE_MISSING', 'production', 'platform', null, 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_unknown_flag', 'shape: unknown flag');
select is(pg_temp.probe('FF_RULE_TEST', 'staging', 'platform', null, 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_unknown_environment', 'shape: staging environment');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'team', null, 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_scope', 'shape: invalid scope');
select is(pg_temp.probe('FF_RULE_PLATFORM_ONLY', 'production', 'workspace', '11111111-1111-4111-8111-111111111111', 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_scope_not_declared', 'shape: undeclared scope');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', '11111111-1111-4111-8111-111111111111', 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_subject', 'shape: platform subject');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'workspace', null, 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_subject', 'shape: workspace without subject');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'maybe', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_mode', 'shape: unknown mode');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'user', '33333333-3333-4333-8333-333333333333', 'staff', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_user_mode', 'shape: staff user rule');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_percentage', 'shape: rollout without percentage');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', 101, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_percentage', 'shape: rollout above 100');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', -1, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_percentage', 'shape: negative rollout');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', 50, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_percentage', 'shape: percentage outside rollout');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, null, 5, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_percentage', 'shape: unset with percentage');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'staff', null, null, array['33333333-3333-4333-8333-333333333333']::uuid[], 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_allow_list', 'shape: allow-list outside rollout');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', 0,
  array(select '11111111-1111-4111-8111-111111111111'::uuid from generate_series(1, 501)), null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_allow_list', 'shape: oversized allow-list');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', 0, null, array[null]::uuid[], 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_allow_list', 'shape: null allow-list entry');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null, 0, '   ', 'admin-ui'),
  'feature_flag_invalid_reason', 'shape: blank reason');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null, 0, repeat('x', 501), 'admin-ui'),
  'feature_flag_invalid_reason', 'shape: long reason');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null, 0, 'Enable for launch', 'cron'),
  'feature_flag_invalid_client', 'shape: unknown client');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null, -1, 'Enable for launch', 'admin-ui'),
  'feature_flag_invalid_revision', 'shape: negative revision');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'user', '33333333-3333-4333-8333-333333333333', 'on', null, null, null, 0, 'Enable for launch', 'admin-ui'),
  'feature_flag_self_mode', 'shape: self user rule on');
select is(pg_temp.probe('FF_RULE_TEST', 'production', 'platform', null, 'rollout', 25, array['11111111-1111-4111-8111-111111111111']::uuid[], null, 0, 'Enable for launch', 'admin-ui'),
  'applied', 'shape: valid rollout');
select is((select count(*)::int from private.feature_flag_rules where flag_key = 'FF_RULE_TEST'), 0,
  'probes leave no rules behind');

-- Database constraints back the shape rules -------------------------------------------

select is(pg_temp.as_role($q$insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
  values ('FF_RULE_TEST', 'platform', null, 'production', 'on', 1, '5ff00000-0000-4000-8000-000000000002')$q$, 'service_role'),
  '42501', 'service_role cannot insert a rule directly');
select throws_ok($q$insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
  values ('FF_RULE_TEST', 'platform', null, 'production', 'on', 1, '5ff00000-0000-4000-8000-000000000002')$q$,
  '42501', 'feature_flag_direct_write', 'an owner write outside the entrypoint is refused');
select set_config('feature_flags.entrypoint', 'mutate_rule', true);
select throws_ok($q$insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
  values ('FF_RULE_TEST', 'user', '33333333-3333-4333-8333-333333333333', 'production', 'staff', 1, '5ff00000-0000-4000-8000-000000000002')$q$,
  '23514', null, 'the shape CHECK rejects a staff user rule written past the RPC');
select throws_ok($q$insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, percentage, revision, updated_by)
  values ('FF_RULE_TEST', 'platform', null, 'production', 'on', 10, 1, '5ff00000-0000-4000-8000-000000000002')$q$,
  '23514', null, 'the shape CHECK rejects a percentage outside rollout');
select throws_ok($q$insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
  values ('FF_RULE_TEST', 'platform', null, 'production', 'on', 1, '5ff00000-0000-4000-8000-000000000002'),
         ('FF_RULE_TEST', 'platform', null, 'production', 'off', 1, '5ff00000-0000-4000-8000-000000000002')$q$,
  '23505', null, 'a duplicate platform rule is impossible even with a null subject');
select set_config('feature_flags.entrypoint', '', true);

-- Controller authorization ------------------------------------------------------

select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000003', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Viewer attempt', 'admin-ui'),
  'feature_flag_denied', 'a root viewer cannot write a platform rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Tenant creator attempt', 'admin-ui'),
  'feature_flag_denied', 'a non-root workspace creator cannot write a platform rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000005', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Tenant role attempt', 'admin-ui'),
  'feature_flag_denied', 'a tenant role with manage_feature_flags cannot write a platform rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000007', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Root admin', 'admin-ui'),
  'applied', 'a root member with the admin permission can write a platform rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000008', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'off', null, null, null, 0, 'Guest attempt', 'workspace-ui'),
  'feature_flag_denied', 'a workspace guest cannot write the workspace-admin rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 0, 'Tenant opt-in', 'workspace-ui', true),
  'applied', 'a workspace settings manager can write its workspace-admin rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a2', 'on', null, null, null, 0, 'Other tenant', 'workspace-ui'),
  'feature_flag_denied', 'a workspace admin cannot write another workspace rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000005', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'off', null, null, null, 0, 'Member attempt', 'workspace-ui'),
  'feature_flag_denied', 'a member without settings access cannot write the workspace rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'off', null, null, null, 0, 'Root attempt', 'admin-ui'),
  'feature_flag_denied', 'a root flag manager cannot write a workspace-admin rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000006', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'user', '5ff00000-0000-4000-8000-000000000006', 'off', null, null, null, 0, 'Opt out', 'workspace-ui', true),
  'applied', 'a user can opt out with a self rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000006', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'user', '5ff00000-0000-4000-8000-000000000006', 'on', null, null, null, 0, 'Opt in', 'workspace-ui'),
  'feature_flag_self_mode', 'a self rule cannot turn the flag on');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000006', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'user', '5ff00000-0000-4000-8000-000000000005', 'off', null, null, null, 0, 'Opt out someone', 'workspace-ui'),
  'feature_flag_denied', 'a user cannot write another user self rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_ADMIN_USER', 'production',
  'user', '5ff00000-0000-4000-8000-000000000006', 'on', null, null, null, 0, 'Beta tester', 'admin-ui', true),
  'applied', 'a root flag manager can write a platform-admin user rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000006', gen_random_uuid(), 'FF_RULE_ADMIN_USER', 'production',
  'user', '5ff00000-0000-4000-8000-000000000006', 'off', null, null, null, 0, 'Self attempt', 'workspace-ui'),
  'feature_flag_denied', 'a user cannot write a platform-admin user rule for themselves');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_ADMIN_USER', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 0, 'Tenant attempt', 'workspace-ui'),
  'feature_flag_denied', 'a workspace admin cannot write a platform-admin workspace rule');

-- Writes, compare-and-swap, replay, unset -----------------------------------------

select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', '5ff00000-0000-4000-8000-0000000000e1', 'FF_RULE_TEST', 'production',
  'platform', null, 'staff', null, null, null, 0, 'Staff dogfood', 'admin-ui', true),
  'applied', 'the root flag manager writes the platform rule');
select is((select row(mode, revision, updated_by)::text from private.feature_flag_rules
  where flag_key = 'FF_RULE_TEST' and scope = 'platform' and environment = 'production'),
  row('staff', 1::bigint, '5ff00000-0000-4000-8000-000000000002'::uuid)::text, 'the platform rule is stored at revision 1');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Stale write', 'admin-ui', true),
  'conflict', 'a stale expected revision conflicts');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', '5ff00000-0000-4000-8000-0000000000e1', 'FF_RULE_TEST', 'production',
  'platform', null, 'staff', null, null, null, 0, 'Staff dogfood', 'admin-ui', true),
  'replayed', 'a retried operation replays');
select is((pg_temp.rpc($q$private.feature_flag_mutate_rule('5ff00000-0000-4000-8000-000000000002',
  '5ff00000-0000-4000-8000-0000000000e1', 'FF_RULE_TEST', 'production', 'platform', null, 'on', null, null, null,
  0, 'Different body', 'admin-ui')$q$) ->> 'matchesRequest'), 'false', 'a reused operation id with another rule does not match');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000007', '5ff00000-0000-4000-8000-0000000000e1', 'FF_RULE_TEST', 'production',
  'platform', null, 'staff', null, null, null, 0, 'Staff dogfood', 'admin-ui', true),
  'feature_flag_operation_conflict', 'another actor cannot replay an operation id');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', '5ff00000-0000-4000-8000-0000000000e1', 'FF_RULE_TEST', 'development',
  'platform', null, 'staff', null, null, null, 0, 'Staff dogfood', 'admin-ui', true),
  'feature_flag_operation_conflict', 'an operation id cannot be replayed against another rule identity');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'staff', null, null, null, 1, 'Same rule', 'admin-ui', true),
  'noop', 'writing the same rule is a no-op');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'rollout', 10, null, array['5ff00000-0000-4000-8000-000000000005']::uuid[], 1, 'Widen to 10%', 'ttr', true),
  'applied', 'a rollout replaces the platform rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', '5ff00000-0000-4000-8000-0000000000e2', 'FF_RULE_TEST', 'production',
  'platform', null, null, null, null, null, 2, 'Reset to fallback', 'admin-ui', true),
  'applied', 'a null mode unsets the platform rule');
select is((select row(mode, revision)::text from private.feature_flag_rules
  where flag_key = 'FF_RULE_TEST' and scope = 'platform' and environment = 'production'),
  row(null::text, 3::bigint)::text, 'the unset rule keeps its revision');
select is((select row(old_rule ->> 'mode', new_rule, reason, client)::text from private.feature_flag_audit
  where operation_id = '5ff00000-0000-4000-8000-0000000000e2'),
  row('rollout', null::jsonb, 'Reset to fallback', 'admin-ui')::text, 'the unset is audited with the old rule and reason');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'platform', null, 'on', null, null, null, 0, 'Recreate from zero', 'admin-ui', true),
  'conflict', 're-creating an unset rule needs its revision, not zero');
select is((select count(*)::int from private.feature_flag_audit where flag_key in ('FF_RULE_TEST', 'FF_RULE_ADMIN_USER')),
  6, 'every applied write has one audit row and nothing else does');
select is(coalesce(current_setting('feature_flags.entrypoint', true), ''), '',
  'the entrypoint setting is cleared once a write returns');

-- Reads -----------------------------------------------------------------------------

select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_PLATFORM_ONLY', 'production',
  'platform', null, 'rollout', 0, null, array['5ff00000-0000-4000-8000-000000000006']::uuid[], 0, 'Allow one tester', 'admin-ui', true),
  'applied', 'a platform rollout allow-lists one user');
select is((select jsonb_agg(r ->> 'flagKey' || ':' || (r ->> 'scope'))
  from jsonb_array_elements(pg_temp.rpc($q$private.feature_flag_read_snapshot('production')$q$) -> 'rules') as r),
  '["FF_RULE_PLATFORM_ONLY:platform"]'::jsonb, 'the snapshot holds only live platform rules');
select ok(length(pg_temp.rpc($q$private.feature_flag_read_snapshot('production')$q$) ->> 'version') = 32
  and pg_temp.rpc($q$private.feature_flag_read_snapshot('production')$q$) ->> 'version'
    <> pg_temp.rpc($q$private.feature_flag_read_snapshot('development')$q$) ->> 'version',
  'the snapshot carries a content version');
select is(pg_temp.rpc($q$private.feature_flag_read_snapshot('staging')$q$) ->> 'error',
  'feature_flag_unknown_environment', 'the snapshot has no staging environment');
select is((select jsonb_agg(r ->> 'flagKey' || ':' || (r ->> 'scope') order by r ->> 'flagKey', r ->> 'scope')
  from jsonb_array_elements(pg_temp.rpc($q$private.feature_flag_read_subject_rules('production',
    '5ff00000-0000-4000-8000-0000000000a1', '5ff00000-0000-4000-8000-000000000006')$q$) -> 'rules') as r),
  '["FF_RULE_ADMIN_USER:user", "FF_RULE_TEST:user", "FF_RULE_TEST:workspace"]'::jsonb,
  'the subject read returns only the actor workspace and user rules');
select is(jsonb_array_length(pg_temp.rpc($q$private.feature_flag_read_subject_rules('production',
  '5ff00000-0000-4000-8000-0000000000a2', '5ff00000-0000-4000-8000-000000000005')$q$) -> 'rules'), 0,
  'another workspace and user see no subject rules');
select is(jsonb_array_length(pg_temp.rpc($q$private.feature_flag_read_rules('5ff00000-0000-4000-8000-000000000003',
  'FF_RULE_TEST', 'production')$q$) -> 'rules'), 3, 'a root viewer reads every rule, including the unset one');
create temp table ff_rules_page as select pg_temp.rpc($q$private.feature_flag_read_rules('5ff00000-0000-4000-8000-000000000003',
  'FF_RULE_TEST', 'production', 2)$q$) as page;
select ok(jsonb_array_length((select page -> 'rules' from ff_rules_page)) = 2
  and (select page -> 'nextCursor' ->> 'flagKey' from ff_rules_page) = 'FF_RULE_TEST',
  'the rules read is bounded by its limit and returns a cursor');
select is((select jsonb_build_array(jsonb_array_length(next -> 'rules'), next -> 'nextCursor',
    next -> 'rules' -> 0 ->> 'scope' > (page -> 'rules' -> 1 ->> 'scope'))
  from ff_rules_page, pg_temp.rpc(format($q$private.feature_flag_read_rules('5ff00000-0000-4000-8000-000000000003',
    'FF_RULE_TEST', 'production', 2, %L, %L, %L::uuid)$q$, page -> 'nextCursor' ->> 'flagKey',
    page -> 'nextCursor' ->> 'scope', page -> 'nextCursor' ->> 'subjectId')) as next),
  '[1, null, true]'::jsonb, 'the next rules page starts after the cursor and ends the list');
select is(pg_temp.rpc($q$private.feature_flag_read_rules('5ff00000-0000-4000-8000-000000000004', null, 'production')$q$) ->> 'error',
  'feature_flag_denied', 'a non-root workspace creator cannot read the rules');
create temp table ff_page as select pg_temp.rpc($q$private.feature_flag_read_audit('5ff00000-0000-4000-8000-000000000002',
  2, null, null)$q$) -> 'rows' as rows;
select is(jsonb_array_length((select rows from ff_page)), 2, 'the audit read is bounded by its limit');
select ok(not exists (
  select 1
  from jsonb_array_elements(pg_temp.rpc(format($q$private.feature_flag_read_audit('5ff00000-0000-4000-8000-000000000002',
    100, %L::timestamptz, %L::uuid)$q$, (select rows -> 1 ->> 'occurredAt' from ff_page),
    (select rows -> 1 ->> 'id' from ff_page))) -> 'rows') as next_row
  join jsonb_array_elements((select rows from ff_page)) as seen on seen ->> 'id' = next_row ->> 'id'
), 'the next audit page starts after the cursor row');
select is(pg_temp.rpc($q$private.feature_flag_read_audit('5ff00000-0000-4000-8000-000000000005', 10, null, null)$q$) ->> 'error',
  'feature_flag_denied', 'a tenant member cannot read the audit');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($q$select private.feature_flag_read_rules('5ff00000-0000-4000-8000-000000000003', null, 'production')$q$,
  '42501', 'feature_flag_denied', 'a definer RPC refuses a non-service request JWT');
select set_config('request.jwt.claims', '{"sub":"5ff00000-0000-4000-8000-000000000003"}', true);
select throws_ok($q$select private.feature_flag_read_snapshot('production')$q$,
  '42501', 'feature_flag_denied', 'a definer RPC refuses request claims without a role');
select set_config('request.jwt.claims', '', true);

-- Append-only audit and guarded rules ---------------------------------------------------

select throws_ok($q$update private.feature_flag_audit set reason = 'rewritten'$q$, '42501',
  'feature_flag_audit_immutable', 'audit rows cannot be updated');
select throws_ok($q$delete from private.feature_flag_audit$q$, '42501',
  'feature_flag_store_delete', 'audit rows cannot be deleted');
select throws_ok($q$truncate private.feature_flag_audit$q$, '42501',
  'feature_flag_store_delete', 'the audit cannot be truncated');
select throws_ok($q$delete from private.feature_flag_rules$q$, '42501',
  'feature_flag_store_delete', 'rules are unset through the RPC, never deleted');
select throws_ok($q$update private.feature_flag_rules set mode = 'on'$q$, '42501',
  'feature_flag_direct_write', 'rules cannot be updated outside the RPC');
select throws_ok($q$update private.feature_flag_definitions set kind = 'operational'$q$, '42501',
  'feature_flag_direct_write', 'definitions cannot be updated outside the sync RPC');

-- Definition sync cannot orphan a stored rule --------------------------------------------

select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_RULE_TEST","kind":"release",
  "scopes":["platform","workspace"],"controllers":{"platform":"platform-admin","workspace":"workspace-admin"}}]'::jsonb)$q$) ->> 'error',
  'feature_flag_definition_orphans_rules', 'removing a scope that holds a live rule is refused');
select is((select scopes from private.feature_flag_definitions where flag_key = 'FF_RULE_TEST'),
  array['platform', 'workspace', 'user']::text[], 'the refused sync leaves the definition unchanged');

-- Control widening needs an acknowledgement ---------------------------------------------

select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_RULE_ADMIN_USER","kind":"release",
  "scopes":["platform","workspace","user"],"controllers":{"platform":"platform-admin",
  "workspace":"platform-admin","user":"self"},"delegate":"workspace"}]'::jsonb)$q$) ->> 'error',
  'feature_flag_definition_widens_control', 'handing live platform-admin user rules to users is refused');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_RULE_TEST","kind":"release",
  "scopes":["platform","workspace","user"],"controllers":{"platform":"platform-admin",
  "workspace":"workspace-admin","user":"self"},"delegate":"workspace"}]'::jsonb)$q$) ->> 'error',
  'feature_flag_definition_widens_control', 'newly delegating a scope with live workspace rules is refused');
select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[{"key":"FF_RULE_ADMIN_USER","kind":"release",
  "scopes":["platform","workspace","user"],"controllers":{"platform":"platform-admin",
  "workspace":"platform-admin","user":"self"},"delegate":"workspace"}]'::jsonb, true)$q$) ->> 'changed', '1',
  'an acknowledged widening applies');
select is((select row(old_definition -> 'controllers' ->> 'user', new_definition -> 'controllers' ->> 'user',
  acknowledged_widening)::text from private.feature_flag_definition_audit
  where flag_key = 'FF_RULE_ADMIN_USER' and old_definition is not null),
  row('platform-admin', 'self', true)::text, 'the definition audit records the acknowledged widening');
select throws_ok($q$update private.feature_flag_definition_audit set acknowledged_widening = false$q$, '42501',
  'feature_flag_audit_immutable', 'definition audit rows cannot be updated');

-- Subject erasure -----------------------------------------------------------------------

select is(pg_temp.rpc($q$private.feature_flag_erase_subject('user', '5ff00000-0000-4000-8000-000000000006')$q$)
  - 'status' - 'anonymizedAudit', '{"deletedRules": 2, "strippedRules": 1}'::jsonb,
  'erasure deletes the user rules and strips the user from allow-lists');
select ok(not exists (select 1 from private.feature_flag_rules
  where subject_id = '5ff00000-0000-4000-8000-000000000006' or updated_by = '5ff00000-0000-4000-8000-000000000006'
    or '5ff00000-0000-4000-8000-000000000006' = any (allow_user_ids)), 'no rule names the erased user');
select ok(not exists (select 1 from private.feature_flag_audit
  where actor_id = '5ff00000-0000-4000-8000-000000000006' or subject_id = '5ff00000-0000-4000-8000-000000000006'
    or coalesce(old_rule::text, '') || coalesce(new_rule::text, '') like '%5ff00000-0000-4000-8000-000000000006%'),
  'no audit row names the erased user');
select is((select row(allow_user_ids, revision)::text from private.feature_flag_rules
  where flag_key = 'FF_RULE_PLATFORM_ONLY' and environment = 'production'),
  row('{}'::uuid[], 2::bigint)::text, 'the stripped allow-list bumps its revision');
select is((select count(*)::int from private.feature_flag_audit where client = 'erasure' and actor_id is null), 3,
  'each erasure write has an audit row with no actor');
select is(pg_temp.rpc($q$private.feature_flag_erase_subject('user', '5ff00000-0000-4000-8000-000000000006')$q$) ->> 'deletedRules',
  '0', 'erasure is idempotent');
select is(pg_temp.rpc($q$private.feature_flag_erase_subject('workspace', '5ff00000-0000-4000-8000-0000000000a1')$q$) ->> 'deletedRules',
  '1', 'a workspace purge erases its workspace rules');
select is(pg_temp.rpc($q$private.feature_flag_erase_subject('platform', null)$q$) ->> 'error',
  'feature_flag_invalid_subject', 'erasure needs a user or workspace subject');
select is(coalesce(current_setting('feature_flags.entrypoint', true), ''), '',
  'the erasure entrypoint is cleared once it returns');

-- Caps on enabling subject rules ---------------------------------------------------------

select set_config('feature_flags.entrypoint', 'mutate_rule', true);
insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
select 'FF_RULE_TEST', 'workspace', gen_random_uuid(), 'production', 'on', 1, null
from generate_series(1, 50000);
select set_config('feature_flags.entrypoint', '', true);
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 0, 'Over the cap', 'workspace-ui'),
  'feature_flag_rule_limit', 'a flag holds at most 50000 enabling workspace and user rules per environment');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'off', null, null, null, 0, 'Workspace kill', 'workspace-ui'),
  'applied', 'a workspace off rule is allowed at the cap');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000005', gen_random_uuid(), 'FF_RULE_TEST', 'production',
  'user', '5ff00000-0000-4000-8000-000000000005', 'off', null, null, null, 0, 'Opt out', 'workspace-ui'),
  'applied', 'a self opt-out is allowed at the cap');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 0, 'Other environment', 'workspace-ui'),
  'applied', 'the cap counts one environment');

insert into public.workspace_members (ws_id, user_id, type) values
  ('5ff00000-0000-4000-8000-0000000000a2', '5ff00000-0000-4000-8000-000000000004', 'MEMBER');
insert into public.workspace_roles (id, ws_id, name) values
  ('5ff00000-0000-4000-8000-0000000000c5', '5ff00000-0000-4000-8000-0000000000a2', 'Settings managers');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('5ff00000-0000-4000-8000-0000000000a2', '5ff00000-0000-4000-8000-0000000000c5', 'manage_workspace_settings', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('5ff00000-0000-4000-8000-0000000000c5', '5ff00000-0000-4000-8000-000000000004');

select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a2', 'off', null, null, null, 0, 'Start off', 'workspace-ui', true),
  'applied', 'the workspace starts with an off rule');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a2', 'on', null, null, null, 1, 'Enable', 'workspace-ui', true),
  'applied', 'off to on consumes one quota slot');

select set_config('feature_flags.entrypoint', 'mutate_rule', true);
insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by, enabled_by)
select flag, 'workspace', gen_random_uuid(), 'development', 'on', 1, actor, actor
from generate_series(1, 199),
  (values ('FF_RULE_TEST', '5ff00000-0000-4000-8000-000000000004'::uuid),
    ('FF_RULE_ADMIN_USER', '5ff00000-0000-4000-8000-000000000002'::uuid)) as quota(flag, actor);
insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by, enabled_by)
values ('FF_RULE_ADMIN_USER', 'workspace', gen_random_uuid(), 'development', 'on', 1,
  '5ff00000-0000-4000-8000-000000000002', '5ff00000-0000-4000-8000-000000000002');
select set_config('feature_flags.entrypoint', '', true);
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 0, 'Over the quota', 'workspace-ui'),
  'feature_flag_actor_rule_limit', 'a tenant actor holds at most 200 enabling rules per flag and environment');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'off', null, null, null, 0, 'Off at quota', 'workspace-ui', true),
  'applied', 'an off rule is allowed at the actor quota');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 1, 'Enable at quota', 'workspace-ui'),
  'feature_flag_actor_rule_limit', 'off to on is refused at the actor quota');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000001', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a2', 'staff', null, null, null, 2, 'Second manager edits', 'workspace-ui', true),
  'applied', 'a second settings manager can edit the enabling rule');
select is((select row(enabled_by, updated_by)::text from private.feature_flag_rules
  where flag_key = 'FF_RULE_TEST' and environment = 'development' and subject_id = '5ff00000-0000-4000-8000-0000000000a2'),
  row('5ff00000-0000-4000-8000-000000000004'::uuid, '5ff00000-0000-4000-8000-000000000001'::uuid)::text,
  'editing an enabling rule preserves the original enabler');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000004', gen_random_uuid(), 'FF_RULE_TEST', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a1', 'on', null, null, null, 1, 'Enable after edit', 'workspace-ui'),
  'feature_flag_actor_rule_limit', 'another manager cannot free an enabling slot by editing the rule');
select is(pg_temp.rpc($q$private.feature_flag_erase_subject('user', '5ff00000-0000-4000-8000-000000000004')$q$) ->> 'status',
  'erased', 'the enabling actor can be erased');
select is((select row(enabled_by, updated_by)::text from private.feature_flag_rules
  where flag_key = 'FF_RULE_TEST' and environment = 'development' and subject_id = '5ff00000-0000-4000-8000-0000000000a2'),
  row(null::uuid, '5ff00000-0000-4000-8000-000000000001'::uuid)::text,
  'erasure clears the original enabler while preserving the unrelated editor');
select is(pg_temp.try_rule('5ff00000-0000-4000-8000-000000000002', gen_random_uuid(), 'FF_RULE_ADMIN_USER', 'development',
  'workspace', '5ff00000-0000-4000-8000-0000000000a2', 'on', null, null, null, 0, 'Root beyond quota', 'admin-ui'),
  'applied', 'the actor quota does not apply to platform-admin controlled rules');

select has_index('private', 'feature_flag_rules', 'feature_flag_rules_keyset_idx');
select has_index('private', 'feature_flag_audit', 'feature_flag_audit_actor_idx');
select has_index('private', 'feature_flag_audit', 'feature_flag_audit_subject_idx');

select * from finish();
rollback;
