-- Run against the full migration chain, not a reduced schema.
-- Synthetic envelope strings test SQL behavior, not cryptographic validity.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
 ('f7000000-0000-0000-0000-000000000001', 'pw-owner@example.test', now()),
 ('f7000000-0000-0000-0000-000000000002', 'pw-editor@example.test', now()),
 ('f7000000-0000-0000-0000-000000000003', 'pw-viewer@example.test', now()),
 ('f7000000-0000-0000-0000-000000000004', 'pw-outsider@example.test', now());
INSERT INTO public.workspaces(id, name, personal, creator_id) VALUES
 ('f7100000-0000-0000-0000-000000000001', 'Password vault SQL fixture', false, 'f7000000-0000-0000-0000-000000000001'),
 ('f7100000-0000-0000-0000-000000000002', 'Other workspace fixture', false, 'f7000000-0000-0000-0000-000000000004');
-- add_ws_creator already creates the owner membership.
INSERT INTO public.workspace_members(ws_id, user_id, type) VALUES
 ('f7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000002', 'MEMBER'),
 ('f7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000003', 'MEMBER');
CREATE FUNCTION pg_temp.pw_sql_as(p_role text, p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE previous_role text := current_setting('role'); result jsonb;
BEGIN
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_sql INTO result;
  EXCEPTION WHEN OTHERS THEN
    result := jsonb_build_object('error', SQLSTATE);
  END;
  PERFORM set_config('role', previous_role, true);
  RETURN result;
END $$;
CREATE FUNCTION pg_temp.pw_op(p_action text, p_input jsonb, p_actor uuid DEFAULT 'f7000000-0000-0000-0000-000000000001',
  p_request uuid DEFAULT gen_random_uuid(), p_token uuid DEFAULT NULL, p_digest text DEFAULT NULL,
  p_ws uuid DEFAULT 'f7100000-0000-0000-0000-000000000001', p_vault uuid DEFAULT 'f7200000-0000-0000-0000-000000000001')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.pw_sql_as('service_role', format(
    'SELECT private.password_vault_execute(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L,%L::jsonb,%L::uuid,%L)',
    p_ws, p_vault, p_actor, p_request, p_action, p_input, p_token, p_digest));
$$;
CREATE FUNCTION pg_temp.pw_revision() RETURNS bigint LANGUAGE sql AS $$
  SELECT revision FROM private.password_vaults WHERE id = 'f7200000-0000-0000-0000-000000000001';
$$;
CREATE FUNCTION pg_temp.pw_write(p_item uuid DEFAULT 'f7300000-0000-0000-0000-000000000001', p_item_revision bigint DEFAULT 0)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('expected_revision', pg_temp.pw_revision(), 'item_id', p_item,
    'expected_item_revision', p_item_revision, 'version', (SELECT active_version FROM private.password_vaults
      WHERE id = 'f7200000-0000-0000-0000-000000000001'),
    'name','CLI_API_KEY', 'encrypted_payload', repeat('x',64), 'ciphertext_bytes',64);
$$;
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','CLI test vault','encrypted_data_key',repeat('k',64)),
  p_request=>'f7400000-0000-0000-0000-000000000001')->>'revision','1','service_role creates an audited vault');
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','CLI test vault','encrypted_data_key',repeat('k',64)),
  p_request=>'f7400000-0000-0000-0000-000000000001')->>'replayed','true','unknown create outcome reconciles original request');
SELECT is((SELECT count(*)::integer FROM private.password_vault_audit_events),1,'create replay adds no second mutation');
SELECT ok((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'password_vault%'),'all Passwords tables force RLS');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='private' AND tablename LIKE 'password_vault%'),
  'no client RLS policies exist');
SELECT is(pg_temp.pw_sql_as(role, format('SELECT to_jsonb(x) FROM private.password_vault_items x LIMIT 1'))->>'error',
  '42501', role || ' cannot select ciphertext directly') FROM (VALUES ('anon'),('authenticated'),('supabase_auth_admin'),('service_role')) r(role);
SELECT is(pg_temp.pw_sql_as(role, $$SELECT private.password_vault_execute(
 'f7100000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001',
 'f7000000-0000-0000-0000-000000000001',gen_random_uuid(),'item.list','{}')$$)->>'error',
 '42501',role || ' cannot invoke the trusted operation') FROM (VALUES ('anon'),('authenticated'),('supabase_auth_admin')) r(role);
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='private' AND table_name LIKE 'password_vault%' AND grantee IN ('PUBLIC','anon','authenticated','supabase_auth_admin','service_role')),
  'there are no direct table grants that bypass audit');
-- Exercise every table boundary, not only privilege catalogs.
SELECT is(pg_temp.pw_sql_as(r.role, format('SELECT to_jsonb(x) FROM private.%I x LIMIT 1', t.name))->>'error',
 '42501', r.role || ' cannot select ' || t.name)
 FROM (VALUES ('anon'),('authenticated'),('supabase_auth_admin'),('service_role')) r(role)
 CROSS JOIN (VALUES ('password_vaults'),('password_vault_members'),('password_vault_versions'),
 ('password_vault_items'),('password_vault_files'),('password_vault_machine_grants'),
 ('password_vault_machine_tokens'),('password_vault_requests'),('password_vault_audit_events')) t(name);
SELECT is(pg_temp.pw_sql_as(role, $$SELECT private.password_vault_list(
 'f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001',gen_random_uuid())$$)->>'error',
 '42501',role || ' cannot bypass the vault list service boundary')
 FROM (VALUES ('anon'),('authenticated'),('supabase_auth_admin')) r(role);
SELECT is(pg_temp.pw_sql_as('service_role', sql)->>'error','42501','service role cannot directly invoke helper ' || name)
 FROM (VALUES
 ('membership', $$SELECT private.password_vault_require_workspace_member(NULL,NULL)$$),
 ('file', $$SELECT private.password_vault_register_file(NULL,NULL,1,NULL,NULL,NULL,64)$$),
 ('invalidation', $$SELECT private.password_vault_invalidate_workspace_member(NULL,NULL)$$),
 ('audit trigger', $$SELECT private.password_vault_audit_immutable()$$),
 ('member trigger', $$SELECT private.password_vault_workspace_member_changed()$$),
 ('archive trigger', $$SELECT private.password_vault_workspace_user_archived()$$),
 ('unlink trigger', $$SELECT private.password_vault_workspace_user_unlinked()$$)) x(name,sql);
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',0))->>'version','1','human first put prepares a named target without a plaintext SQL value');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(),p_request=>'f7400000-0000-0000-0000-000000000002')->>'item_revision',
  '1','write creates ciphertext and item revision');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',
  p_request=>'f7400000-0000-0000-0000-000000000003')->'item'->>'encrypted_payload',repeat('x',64),'audited read returns encrypted row');
SELECT ok(NOT pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',
  p_request=>'f7400000-0000-0000-0000-000000000003') ? 'item','read replay returns receipt without redisclosing ciphertext');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000002"}',
  p_request=>'f7400000-0000-0000-0000-000000000003')->>'error','22023','request id cannot change target');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>1) || '{"expected_revision":1}')->>'error',
  '40001','stale vault revision rejects write');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>0))->>'error','40001','stale item revision rejects write');
SELECT is(pg_temp.pw_op('item.list','{"limit":101}')->>'error','22023','page size is bounded');
SELECT is(pg_temp.pw_op('item.list','{}','f7000000-0000-0000-0000-000000000004')->>'error','42501','outsider cannot access vault');
SELECT is(pg_temp.pw_op('item.list','{}',p_ws=>'f7100000-0000-0000-0000-000000000002')->>'error','42501','workspace mismatch cannot access vault id');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write() || '{"plaintext_last_four":"1234"}')->>'error',
  '22023','unknown and plaintext metadata fields are rejected');
CREATE FUNCTION pg_temp.pw_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Injected audit append failure' USING ERRCODE='P0001'; END $$;
CREATE TRIGGER pw_test_audit_failure BEFORE INSERT ON private.password_vault_audit_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pw_fail_audit();
CREATE TEMP TABLE before_failure AS SELECT pg_temp.pw_revision() AS revision,
  (SELECT count(*) FROM private.password_vault_requests) AS request_count;
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}')->>'error',
  'P0001','audit failure suppresses secret read');
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',1))->>'error','P0001','audit failure suppresses write key disclosure');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>1))->>'error',
  'P0001','audit failure aborts secret write');
SELECT is(pg_temp.pw_op('rotation.snapshot',jsonb_build_object('expected_revision',pg_temp.pw_revision()))->>'error',
 'P0001','audit failure suppresses complete rotation snapshot');

SELECT is(pg_temp.pw_op(action,input)->>'error','P0001',action || ' fails closed on audit failure')
 FROM (VALUES ('member.list','{}'::jsonb),('audit.list','{}'::jsonb),
 ('request.status','{"request_id":"f7400000-0000-0000-0000-000000000001"}'::jsonb)) x(action,input);

SELECT is(pg_temp.pw_revision(),(SELECT revision FROM before_failure),'audit failure rolls back vault revision');
SELECT is((SELECT revision FROM private.password_vault_items WHERE id='f7300000-0000-0000-0000-000000000001'),
  1::bigint,'audit failure rolls back item revision');
SELECT is((SELECT count(*) FROM private.password_vault_requests),(SELECT request_count FROM before_failure),
  'audit failure leaves no completed request');
DROP TRIGGER pw_test_audit_failure ON private.password_vault_audit_events;
SELECT is(pg_temp.pw_sql_as('service_role', $$UPDATE private.password_vault_audit_events SET metadata='{}' RETURNING '{}'::jsonb$$)->>'error',
  '42501','service role cannot rewrite audit events');
SELECT throws_ok($$DELETE FROM private.password_vault_audit_events$$,'42501','Password vault audit events are append-only',
  'append-only trigger also rejects privileged row deletion');
SELECT throws_ok($$TRUNCATE private.password_vault_audit_events$$,'42501','Password vault audit events are append-only',
  'append-only trigger rejects truncate');
SELECT throws_ok($$INSERT INTO private.password_vault_audit_events(ws_id,vault_id,request_id,actor_user_id,event_type,metadata)
 VALUES('f7100000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001',gen_random_uuid(),
 'f7000000-0000-0000-0000-000000000001','item.read','{"revision":1,"authorizationEpoch":1,"secret":"forbidden"}')$$,
 '23514',NULL,'audit metadata cannot include arbitrary fields');
SELECT is(pg_temp.pw_op('member.set', jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000002','role','editor','revoked',false))->>'error',NULL,'owner adds workspace-scoped editor');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}')->>'error',
 '55000','membership change fences disclosure pending rotation');
CREATE FUNCTION pg_temp.pw_rotate() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('expected_revision', pg_temp.pw_revision(), 'encrypted_data_key',repeat('n',64),
 'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'expected_item_revision',revision,
 'encrypted_payload',repeat('r',64),'ciphertext_bytes',64)) FROM private.password_vault_items
 WHERE vault_id='f7200000-0000-0000-0000-000000000001' AND deleted_at IS NULL),'[]'::jsonb));
$$;
SELECT is(jsonb_array_length(pg_temp.pw_op('rotation.snapshot',jsonb_build_object('expected_revision',pg_temp.pw_revision()),
 p_request=>'f7400000-0000-0000-0000-000000000019')->'items'),1,'owner obtains complete audited rotation snapshot during hold');
SELECT ok(NOT pg_temp.pw_op('rotation.snapshot',jsonb_build_object('expected_revision',pg_temp.pw_revision()),
 p_request=>'f7400000-0000-0000-0000-000000000019') ? 'versions','snapshot replay does not redisclose wrapped keys');
SELECT is(pg_temp.pw_op('rotation.snapshot',jsonb_build_object('expected_revision',pg_temp.pw_revision()),
 'f7000000-0000-0000-0000-000000000002')->>'error','42501','editor cannot take owner rotation snapshot');
SELECT is(pg_temp.pw_op('member.list','{}')->'members'->0->>'role','owner','owner lists members during rotation hold');
SELECT is(pg_temp.pw_op('audit.list','{"limit":1}')->>'error',NULL,'owner inspects audit during rotation hold');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000002"}')->>'status',
 'committed','receipt metadata remains available during rotation hold');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate() || '{"items":[]}')->>'error','40001','rotation cannot omit live items');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'active_version','2','atomic rotation replaces all ciphertext');
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',2),'f7000000-0000-0000-0000-000000000002')->>'version',
 '2','editor gets audited active wrapped key for an already scoped item write');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>2),'f7000000-0000-0000-0000-000000000002')->>'item_revision',
 '3','editor can write');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000003','role','viewer','revoked',false))->>'error',NULL,'owner adds viewer');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'owner rotates after membership change');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>4),'f7000000-0000-0000-0000-000000000003')->>'error',
 '42501','viewer cannot write');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',
 'f7000000-0000-0000-0000-000000000003')->'item'->>'encrypted_payload',repeat('r',64),'viewer can perform audited read');
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',4),'f7000000-0000-0000-0000-000000000003')->>'error',
 '42501','viewer cannot obtain wrapped key through the write path');
SELECT is(pg_temp.pw_op(action,'{}',actor::uuid)->>'error','42501',action || ' denies ' || role)
 FROM (VALUES ('member.list'),('audit.list')) a(action)
 CROSS JOIN (VALUES ('editor','f7000000-0000-0000-0000-000000000002'),
 ('viewer','f7000000-0000-0000-0000-000000000003'),('outsider','f7000000-0000-0000-0000-000000000004')) r(role,actor);
SELECT is(jsonb_array_length(pg_temp.pw_op('member.list','{"limit":1}')->'members'),1,'member page is bounded');
SELECT is(pg_temp.pw_op('member.list','{"after_id":"f7000000-0000-0000-0000-000000000001","limit":1}')->'members'->0->>'role',
 'editor','member keyset excludes the cursor');
SELECT is(pg_temp.pw_op(action,'{"limit":101}')->>'error','22023',action || ' rejects overlarge page')
 FROM (VALUES ('member.list'),('audit.list')) a(action);
SELECT is(pg_temp.pw_op('audit.list','{"after_id":"f7400000-0000-0000-0000-000000000001"}')->>'error',
 '22023','audit cursor requires both timestamp and id');
SELECT is(pg_temp.pw_op('audit.list','{"after_id":"bad","after_created_at":"bad"}')->>'error',
 '22023','malformed audit cursor has a fixed error code');
CREATE TEMP TABLE audit_first AS SELECT pg_temp.pw_op('audit.list','{"limit":1}') AS result;
SELECT is(jsonb_array_length((SELECT result->'events' FROM audit_first)),1,'audit page returns one event');
CREATE TEMP TABLE audit_next AS SELECT pg_temp.pw_op('audit.list',jsonb_build_object('limit',1,
 'after_id',result->'events'->0->>'id','after_created_at',result->'events'->0->>'created_at')) AS result FROM audit_first;
SELECT ok((SELECT (b.result->'events'->0->>'created_at')::timestamptz < (a.result->'events'->0->>'created_at')::timestamptz
 OR ((b.result->'events'->0->>'created_at')::timestamptz = (a.result->'events'->0->>'created_at')::timestamptz
 AND (b.result->'events'->0->>'id')::uuid < (a.result->'events'->0->>'id')::uuid)
 FROM audit_first a CROSS JOIN audit_next b),'audit keyset orders timestamp ties by UUID');
SELECT ok((SELECT (result->'events'->0) - ARRAY['id','request_id','actor_user_id','token_id','actor_type','event_type',
 'item_id','metadata','created_at']::text[] = '{}'::jsonb FROM audit_first),'audit projection excludes input and secret fields');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000002"}',
 'f7000000-0000-0000-0000-000000000002')->>'error','42501','another member cannot reconcile an actor receipt');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',
 'f7000000-0000-0000-0000-000000000003',p_request=>'f7400000-0000-0000-0000-000000000011')->>'error',NULL,
 'viewer creates its own audited read receipt');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000011"}',
 'f7000000-0000-0000-0000-000000000003')->>'status','committed','viewer can reconcile its own read without ciphertext');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000004','role','viewer','revoked',false))->>'error','42501','cross-workspace member rejected');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000001','role','viewer','revoked',true))->>'error','23514','last owner cannot self-remove');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','scopes',jsonb_build_array('item.read'),
 'item_ids',jsonb_build_array('f7300000-0000-0000-0000-000000000001'),'expires_at',now()+interval '1 hour'))->>'error',
 NULL,'owner creates item-scoped machine grant');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id','f7600000-0000-0000-0000-000000000001',
 'token_digest',repeat('a',64),'expires_at',now()+interval '10 minutes'),p_request=>'f7400000-0000-0000-0000-000000000017')->>'error',NULL,'owner issues short-lived hashed credential');
CREATE TEMP TABLE token_status AS SELECT pg_temp.pw_op('request.status',
 '{"request_id":"f7400000-0000-0000-0000-000000000017"}') AS result;
SELECT is((SELECT result->'resource'->>'id' FROM token_status),'f7600000-0000-0000-0000-000000000001',
 'token issuance reconciliation returns the public token identity');
SELECT ok((SELECT result - ARRAY['vault_id','revision','authorization_epoch','active_version','replayed',
 'status','request_id','action','created_at','resource','receipt']::text[] = '{}'::jsonb
 AND (result->'resource') - ARRAY['type','id']::text[] = '{}'::jsonb
 AND (result->'receipt') - ARRAY['vault_id','revision','authorization_epoch','active_version']::text[] = '{}'::jsonb
 FROM token_status),'token issuance status omits input, digest and credential material');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',NULL,
 p_request=>'f7400000-0000-0000-0000-000000000012',p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->'item'->>'encrypted_payload',repeat('r',64),
 'machine credential performs audited scoped read');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000002"}',NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error','42501','machine credential cannot widen item scope');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>4),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error','42501','read-only machine grant cannot write');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('b',64))->>'error','42501','incorrect token digest rejected');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id','f7600000-0000-0000-0000-000000000002',
 'token_digest',repeat('b',64),'expires_at',now()+interval '16 minutes'))->>'error','23514','token lifetime capped at fifteen minutes');
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',4),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error','42501','read-only token cannot fetch the write key');
SELECT is(pg_temp.pw_op('request.status',jsonb_build_object('request_id','f7400000-0000-0000-0000-000000000012',
 'item_id','f7300000-0000-0000-0000-000000000001'),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'status','committed','read token reconciles its own scoped read');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000012"}',NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'status','committed','machine status derives item scope from its authenticated stored request');
SELECT is(pg_temp.pw_op(action,'{}',NULL,p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error',
 '42501','machine cannot call ' || action) FROM (VALUES ('member.list'),('audit.list')) a(action);
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'rotation succeeds with active grant');
SELECT is(pg_temp.pw_op('request.status',jsonb_build_object('request_id','f7400000-0000-0000-0000-000000000012',
 'item_id','f7300000-0000-0000-0000-000000000001'),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error','42501','epoch invalidation denies receipt lookup too');

SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}',NULL,
 p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64))->>'error','42501','rotation invalidates old machine grants');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000003','role','viewer','revoked',true))->>'error',NULL,'owner revokes viewer');
SELECT is(pg_temp.pw_op('item.list','{}','f7000000-0000-0000-0000-000000000003')->>'error','42501','revoked member blocked');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000011"}',
 'f7000000-0000-0000-0000-000000000003')->>'error','42501','revoked actor cannot recover its old receipt');

SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'rotation completes member removal');
DELETE FROM public.workspace_members WHERE ws_id='f7100000-0000-0000-0000-000000000001'
 AND user_id='f7000000-0000-0000-0000-000000000002';
DO $$ BEGIN PERFORM pg_temp.pw_sql_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok((SELECT revoked_at IS NOT NULL FROM private.password_vault_members
 WHERE vault_id='f7200000-0000-0000-0000-000000000001' AND user_id='f7000000-0000-0000-0000-000000000002'),
 'workspace removal revokes retained vault membership');
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
 ('f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000002','MEMBER');
SELECT is(pg_temp.pw_op('item.list','{}','f7000000-0000-0000-0000-000000000002')->>'error','42501','workspace rejoin cannot resurrect membership');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'owner repairs rotation after workspace removal');
SELECT is(pg_temp.pw_op('item.list','{"limit":1}')->'items'->0->>'id','f7300000-0000-0000-0000-000000000001','item pagination returns opaque id');
SELECT is(jsonb_array_length(pg_temp.pw_op('item.list','{"after_id":"f7300000-0000-0000-0000-000000000001","limit":1}')->'items'),
 0,'keyset page excludes cursor row');
SELECT is(jsonb_array_length(pg_temp.pw_sql_as('service_role',$$SELECT private.password_vault_list(
 'f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001',gen_random_uuid())$$)->'vaults'),1,'service role lists only member vaults');


SELECT is(pg_temp.pw_op('item.list','{}')->'items'->0->>'name','CLI_API_KEY','listing returns a non-secret name without decrypting');
SELECT is(pg_temp.pw_op('vault.rename',jsonb_build_object('expected_revision',pg_temp.pw_revision(),'label','Renamed vault'))->>'error',
 NULL,'owner can rename vault label with CAS and audit');
SELECT is(pg_temp.pw_sql_as('service_role',$$SELECT private.password_vault_list(
 'f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001',gen_random_uuid())$$)->'vaults'->0->>'label',
 'Renamed vault','vault label is available without any key disclosure');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write('f7300000-0000-0000-0000-000000000002',0) || '{"name":"cli_api_key"}')->>'error',
 '23505','item names are unique per vault ignoring case');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write('f7300000-0000-0000-0000-000000000002',0) || '{"name":""}')->>'error',
 '23514','empty item name rejected');
SELECT is(pg_temp.pw_op('vault.rename',jsonb_build_object('expected_revision',pg_temp.pw_revision(),'label',repeat('a',129)))->>'error',
 '23514','vault label length bounded');
CREATE TEMP TABLE replay_write AS SELECT pg_temp.pw_write(p_item_revision=>(SELECT revision FROM private.password_vault_items
 WHERE id='f7300000-0000-0000-0000-000000000001')) AS input;
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM replay_write),p_request=>'f7400000-0000-0000-0000-000000000004')->>'error',
 NULL,'first stable write request succeeds');
CREATE TEMP TABLE after_replay_write AS SELECT pg_temp.pw_revision() AS revision;
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM replay_write),p_request=>'f7400000-0000-0000-0000-000000000004')->>'replayed',
 'true','identical write retry returns original receipt');
SELECT is(pg_temp.pw_revision(),(SELECT revision FROM after_replay_write),'write replay does not advance revision');
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM replay_write) || jsonb_build_object('encrypted_payload',repeat('z',64)),
 p_request=>'f7400000-0000-0000-0000-000000000004')->>'error','22023','later changed ciphertext is rejected under the original request');
CREATE TEMP TABLE status_receipt AS SELECT pg_temp.pw_op('request.status',
 '{"request_id":"f7400000-0000-0000-0000-000000000004"}',p_request=>'f7400000-0000-0000-0000-000000000014') AS result;
SELECT is((SELECT result->>'status' FROM status_receipt),'committed','later rejection does not erase the original successful write');
SELECT is((SELECT result->>'action' FROM status_receipt),'item.write','status reports original action');
SELECT is((SELECT result->'resource'->>'id' FROM status_receipt),'f7300000-0000-0000-0000-000000000001','status reports original resource');
SELECT is((SELECT (result->'receipt'->>'revision')::bigint FROM status_receipt),(SELECT revision FROM after_replay_write),
 'status preserves the original receipt revision');
SELECT ok((SELECT result - ARRAY['vault_id','revision','authorization_epoch','active_version','replayed',
 'status','request_id','action','created_at','resource','receipt']::text[] = '{}'::jsonb
 AND (result->'receipt') - ARRAY['vault_id','revision','authorization_epoch','active_version','item_id','item_revision']::text[] = '{}'::jsonb
 FROM status_receipt),'status is a fixed metadata projection, not the original input or ciphertext');
SELECT ok(NOT pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000004"}',
 p_request=>'f7400000-0000-0000-0000-000000000014') ? 'status','status observation replay returns only its audit receipt');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000099"}')->>'status',
 'unknown','absent original request stays UNKNOWN and never reports failed');
SELECT is(pg_temp.pw_op('request.status','{}')->>'error','22023','status requires original request UUID');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"invalid"}')->>'error','22023','malformed request UUID is normalized');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000004"}',
 p_request=>'f7400000-0000-0000-0000-000000000004')->>'error','22023','observation cannot reuse original operation identity');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000004","input":{}}')->>'error',
 '22023','status rejects extra input fields');
SELECT is(pg_temp.pw_revision(),(SELECT revision FROM after_replay_write),'status never advances vault revision');

CREATE TRIGGER pw_test_audit_failure BEFORE INSERT ON private.password_vault_audit_events
 FOR EACH ROW EXECUTE FUNCTION pg_temp.pw_fail_audit();
SELECT is(pg_temp.pw_sql_as('service_role',$$SELECT private.password_vault_list(
 'f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001',gen_random_uuid())$$)->>'error',
 'P0001','vault label listing fails closed if audit append fails');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error','P0001','audit failure rolls back a full rotation');
SELECT is(pg_temp.pw_revision(),(SELECT revision FROM after_replay_write),'failed rotation leaves original revision');
DROP TRIGGER pw_test_audit_failure ON private.password_vault_audit_events;
-- A SQL storage fixture contains metadata only; it does not prove real uploaded bytes.
INSERT INTO storage.objects(id,bucket_id,name,metadata) SELECT
 'f7800000-0000-0000-0000-000000000001','password-vault-files',
 'f7100000-0000-0000-0000-000000000001/f7200000-0000-0000-0000-000000000001/' || active_version::text ||
 '/f7300000-0000-0000-0000-000000000002/f7900000-0000-0000-0000-000000000001',
 '{"size":64,"mimetype":"application/octet-stream"}' FROM private.password_vaults
 WHERE id='f7200000-0000-0000-0000-000000000001';
CREATE TEMP TABLE file_write AS SELECT jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','f7300000-0000-0000-0000-000000000002','expected_item_revision',0,'version',active_version,
 'name','CERTIFICATE','encrypted_file_id','f7900000-0000-0000-0000-000000000001',
 'storage_object_id','f7800000-0000-0000-0000-000000000001','encrypted_metadata',repeat('m',64),'ciphertext_bytes',64) AS input
 FROM private.password_vaults WHERE id='f7200000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM file_write))->>'error',NULL,'file write validates exact bucket/path/object/size');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000002"}')->'item'->>'encrypted_file_id',
 'f7900000-0000-0000-0000-000000000001','audited file read returns only opaque encrypted-file reference');
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM file_write) || jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','f7300000-0000-0000-0000-000000000003','name','OTHER_FILE'))->>'error','22023','file cannot be moved to a different item path');
SELECT is(pg_temp.pw_op('item.write',(SELECT input FROM file_write) || jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','f7300000-0000-0000-0000-000000000003','name','OTHER_FILE','storage_path','../../user-path'))->>'error',
 '22023','caller-provided file paths are rejected');
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT throws_ok($$DELETE FROM storage.objects WHERE id='f7800000-0000-0000-0000-000000000001'$$,
 '23503',NULL,'file-reference FK prevents deleting a committed storage object');
SELECT ok((SELECT public IS FALSE AND file_size_limit=10485760 FROM storage.buckets WHERE id='password-vault-files'),
 'dedicated bucket is private and bounded');
-- Add deliberately broad permissive policies in this rolled-back fixture to prove the restrictive fences compose.
CREATE POLICY pw_test_allow_objects ON storage.objects FOR ALL TO anon,authenticated,supabase_auth_admin USING(true) WITH CHECK(true);
CREATE POLICY pw_test_allow_buckets ON storage.buckets FOR ALL TO anon,authenticated,supabase_auth_admin USING(true) WITH CHECK(true);
SELECT ok(r->>'n'='0' OR r->>'error'='42501',role || ' cannot list Passwords files despite permissive legacy policies')
 FROM (SELECT role,pg_temp.pw_sql_as(role,$$SELECT jsonb_build_object('n',count(*)) FROM storage.objects
 WHERE bucket_id='password-vault-files'$$) r FROM (VALUES('anon'),('authenticated'),('supabase_auth_admin')) roles(role)) x;
SELECT is(pg_temp.pw_sql_as(role,$$INSERT INTO storage.objects(bucket_id,name) VALUES('password-vault-files','user/path')
 RETURNING '{}'::jsonb$$)->>'error','42501',role || ' cannot upload Passwords files directly')
 FROM (VALUES('anon'),('authenticated'),('supabase_auth_admin')) roles(role);
SELECT ok(r->>'n'='0' OR r->>'error'='42501',role || ' cannot list the dedicated bucket')
 FROM (SELECT role,pg_temp.pw_sql_as(role,$$SELECT jsonb_build_object('n',count(*)) FROM storage.buckets
 WHERE id='password-vault-files'$$) r FROM (VALUES('anon'),('authenticated'),('supabase_auth_admin')) roles(role)) x;
-- Restore a viewer, rotate, then archive their linked workspace-user record.
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000003','role','viewer','revoked',false))->>'error',NULL,'owner explicitly restores viewer membership');
SELECT ok(pg_temp.pw_op('item.list','{}') ? 'items','metadata item listing remains available during rotation hold');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'owner rotates restored membership');
INSERT INTO public.workspace_users(id,ws_id,display_name) SELECT
 'f7700000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000001','Viewer fixture'
 WHERE NOT EXISTS(SELECT 1 FROM public.workspace_user_linked_users WHERE ws_id='f7100000-0000-0000-0000-000000000001'
 AND platform_user_id='f7000000-0000-0000-0000-000000000003');
INSERT INTO public.workspace_user_linked_users(ws_id,platform_user_id,virtual_user_id) SELECT
 'f7100000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000003','f7700000-0000-0000-0000-000000000001'
 WHERE NOT EXISTS(SELECT 1 FROM public.workspace_user_linked_users WHERE ws_id='f7100000-0000-0000-0000-000000000001'
 AND platform_user_id='f7000000-0000-0000-0000-000000000003');
UPDATE public.workspace_users SET archived=true WHERE id IN (SELECT virtual_user_id FROM public.workspace_user_linked_users
 WHERE ws_id='f7100000-0000-0000-0000-000000000001' AND platform_user_id='f7000000-0000-0000-0000-000000000003');
DO $$ BEGIN PERFORM pg_temp.pw_sql_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT is(pg_temp.pw_op('item.list','{}','f7000000-0000-0000-0000-000000000003')->>'error','42501','archived member is blocked');
UPDATE public.workspace_users SET archived=false WHERE id IN (SELECT virtual_user_id FROM public.workspace_user_linked_users
 WHERE ws_id='f7100000-0000-0000-0000-000000000001' AND platform_user_id='f7000000-0000-0000-0000-000000000003');
SELECT is(pg_temp.pw_op('item.list','{}','f7000000-0000-0000-0000-000000000003')->>'error','42501','unarchive does not revive vault membership');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'owner rotates archive invalidation');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000002','scopes',jsonb_build_array('item.write'),
 'item_ids',jsonb_build_array('f7300000-0000-0000-0000-000000000001'),'expires_at',now()+interval '1 hour'))->>'error',
 NULL,'owner provisions write-only machine scope for an existing named target');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000002','token_id','f7600000-0000-0000-0000-000000000003',
 'token_digest',repeat('c',64),'expires_at',now()+interval '10 minutes'))->>'error',NULL,'owner issues write-only machine credential');
SELECT ok((pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',(SELECT revision FROM private.password_vault_items
 WHERE id='f7300000-0000-0000-0000-000000000001')),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64)) - ARRAY['vault_id','revision','authorization_epoch','active_version','replayed','encrypted_data_key','version']::text[]) = '{}'::jsonb,
 'write key path exposes no item ciphertext or unlisted fields');
SELECT ok(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',(SELECT revision FROM private.password_vault_items
 WHERE id='f7300000-0000-0000-0000-000000000001')),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64)) ? 'encrypted_data_key',
 'write-only machine receives active wrapped key after audit');
SELECT is(pg_temp.pw_op('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000002',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',1),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64))->>'error','42501','write key is bound to allowed item id');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>(SELECT revision FROM private.password_vault_items
 WHERE id='f7300000-0000-0000-0000-000000000001')),NULL,
 p_request=>'f7400000-0000-0000-0000-000000000015',p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64))->>'error',NULL,'write-only machine completes scoped CAS write');
SELECT is(pg_temp.pw_op('request.status',jsonb_build_object('request_id','f7400000-0000-0000-0000-000000000015',
 'item_id','f7300000-0000-0000-0000-000000000001'),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64))->>'status','committed','write-only token reconciles its write without reveal scope');
SELECT is(pg_temp.pw_op('request.status',jsonb_build_object('request_id','f7400000-0000-0000-0000-000000000015',
 'item_id','f7300000-0000-0000-0000-000000000002'),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64))->>'error','42501','status cannot widen machine item scope');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000015"}')->>'error',
 '42501','issuer session cannot impersonate the original machine token');
SELECT is(pg_temp.pw_op('grant.revoke',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000002'))->>'error',NULL,'owner revokes active write grant');
SELECT is(pg_temp.pw_op('request.status',jsonb_build_object('request_id','f7400000-0000-0000-0000-000000000015',
 'item_id','f7300000-0000-0000-0000-000000000001'),NULL,
 p_token=>'f7600000-0000-0000-0000-000000000003',p_digest=>repeat('c',64))->>'error','42501','revoked grant cannot reconcile metadata');
-- Recheck actual authority at observation time, even for metadata-only receipts.
UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='f7000000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000004"}')->>'error',
 '42501','banned actor cannot reconcile an old receipt');
UPDATE auth.users SET banned_until=NULL WHERE id='f7000000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000002','role','editor','revoked',false))->>'error',NULL,'restore editor for role downgrade test');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'rotate restored editor');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>(SELECT revision FROM private.password_vault_items
 WHERE id='f7300000-0000-0000-0000-000000000001')),'f7000000-0000-0000-0000-000000000002',
 p_request=>'f7400000-0000-0000-0000-000000000016')->>'error',NULL,'editor owns a committed write receipt');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','f7000000-0000-0000-0000-000000000002','role','viewer','revoked',false))->>'error',NULL,'downgrade editor to live viewer');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000016"}',
 'f7000000-0000-0000-0000-000000000002')->>'error','42501','current viewer role cannot reconcile a former write');
SELECT is(pg_temp.pw_op('vault.rotate',pg_temp.pw_rotate())->>'error',NULL,'clear rotation fence before quota tests');
-- Fill item records with explicit fixtures, then exercise the real bounded write operation.
INSERT INTO private.password_vault_items(ws_id,vault_id,id,version,name,revision,encrypted_payload,ciphertext_bytes,deleted_at)
 SELECT 'f7100000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001',gen_random_uuid(),active_version,
 'Retained tombstone ' || n::text,1,repeat('t',64),64,now() FROM private.password_vaults CROSS JOIN generate_series(1,998) n
 WHERE id='f7200000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write('f7300000-0000-0000-0000-000000000003',0) || '{"name":"OVER_LIMIT"}')->>'error',
 '54000','item limit includes retained tombstones');
CREATE TEMP TABLE delete_input AS SELECT jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','f7300000-0000-0000-0000-000000000001','expected_item_revision',revision) AS input
 FROM private.password_vault_items WHERE id='f7300000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_op('item.delete',(SELECT input FROM delete_input),p_request=>'f7400000-0000-0000-0000-000000000018')->>'error',
 NULL,'owner performs audited CAS tombstone delete');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}')->>'error','P0002',
 'tombstoned ciphertext cannot be revealed');
SELECT is(pg_temp.pw_op('item.delete',(SELECT input FROM delete_input),p_request=>'f7400000-0000-0000-0000-000000000018')->>'replayed',
 'true','identical deletion retry returns original receipt');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write(p_item_revision=>0))->>'error','40001','tombstoned item identity cannot be reused');
SELECT is(count(*)::integer,31,'31 additional audited creates reach workspace vault cap') FROM (
 SELECT pg_temp.pw_op('vault.create',jsonb_build_object('label','Bounded vault ' || n::text,'encrypted_data_key',repeat('b',64)),
 p_vault=>gen_random_uuid()) r FROM generate_series(1,31) n) x WHERE r->>'error' IS NULL;
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','OVER_LIMIT','encrypted_data_key',repeat('b',64)),
 p_vault=>gen_random_uuid())->>'error','54000','workspace vault count is bounded');
SELECT * FROM finish();
ROLLBACK;
