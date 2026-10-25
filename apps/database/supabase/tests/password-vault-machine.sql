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
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','Machine fixture','encrypted_data_key',repeat('k',64)))->>'error',NULL,'create vault');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write())->>'error',NULL,'seed granted item');
SELECT is(pg_temp.pw_op('item.write',pg_temp.pw_write('f7300000-0000-0000-0000-000000000002') || '{"name":"OUTSIDE_GRANT"}')->>'error',NULL,'seed unrelated item');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','scopes',jsonb_build_array('item.write'),
 'item_ids',jsonb_build_array('f7300000-0000-0000-0000-000000000001'),'expires_at',now()+interval '1 hour'))->>'error',NULL,'create write-only grant');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id','f7600000-0000-0000-0000-000000000001',
 'token_digest',repeat('a',64),'expires_at',now()+interval '10 minutes'))->>'error',NULL,'issue write-only token');
CREATE FUNCTION pg_temp.pw_machine(p_action text, p_input jsonb DEFAULT '{}'::jsonb, p_request uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.pw_op(p_action,p_input,NULL,p_request,
 'f7600000-0000-0000-0000-000000000001',repeat('a',64));
$$;
CREATE TEMP TABLE metadata AS SELECT pg_temp.pw_machine('item.list') AS result;
SELECT is(jsonb_array_length((SELECT result->'items' FROM metadata)),1,'metadata is item-scoped');
SELECT is((SELECT result->'items'->0->>'name' FROM metadata),'CLI_API_KEY','granted label resolves');
SELECT is((SELECT result->'vault'->>'role' FROM metadata),'editor','machine metadata never grants owner');
SELECT ok((SELECT result::text NOT LIKE '%OUTSIDE_GRANT%' FROM metadata),'ungranted label not disclosed');
SELECT ok((SELECT (result->'items'->0) - ARRAY['id','name','revision','version','is_file']::text[] = '{}'::jsonb FROM metadata),
 'metadata excludes ciphertext, key, file path and value');
SELECT ok((SELECT result->'vault' - ARRAY['id','ws_id','revision','active_version','rotation_required','role']::text[] = '{}'::jsonb FROM metadata),
 'vault metadata has no membership or label enumeration');
SELECT is(pg_temp.pw_machine('item.read','{"item_id":"f7300000-0000-0000-0000-000000000001"}')->>'error','42501','write-only cannot reveal old value');
SELECT is(pg_temp.pw_machine('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',1))->>'version','1','write-only can prepare granted replacement');
SELECT is(pg_temp.pw_machine('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000002',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',1))->>'error','42501','write key cannot widen item scope');
SELECT is(pg_temp.pw_machine(action)->>'error','42501','machine cannot perform ' || action)
 FROM (VALUES ('vault.create'),('vault.rotate'),('rotation.snapshot'),('member.set'),('member.list'),('grant.create'),('grant.revoke'),('token.issue'),('audit.list')) x(action);
SELECT is(pg_temp.pw_machine('item.write',pg_temp.pw_write(p_item_revision=>1),
 'f7400000-0000-0000-0000-000000000070')->>'item_revision','2','write-only can replace its item');
SELECT is(pg_temp.pw_machine('request.status','{"request_id":"f7400000-0000-0000-0000-000000000070"}')->>'status',
 'committed','CLI receipt lookup derives scope from original operation');
SELECT is(pg_temp.pw_machine('request.status','{"request_id":"f7400000-0000-0000-0000-000000000070","item_id":"f7300000-0000-0000-0000-000000000002"}')->>'error',
 '42501','explicit mismatched item is rejected');
SELECT is(pg_temp.pw_machine('request.status',jsonb_build_object('request_id',gen_random_uuid()))->>'status','unknown','missing receipt remains unknown');
SELECT is(pg_temp.pw_machine('item.list','{"limit":101}')->>'error','22023','metadata page cap retained');
SELECT is(pg_temp.pw_op('item.list','{}',NULL,p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('b',64))->>'error','42501','wrong digest cannot enumerate');
SELECT is(pg_temp.pw_op('item.list','{}',NULL,p_token=>'f7600000-0000-0000-0000-000000000001',p_digest=>repeat('a',64),
 p_ws=>'f7100000-0000-0000-0000-000000000002')->>'error','42501','workspace mismatch cannot enumerate');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='private'
 AND table_name LIKE 'password_vault%' AND grantee IN ('PUBLIC','anon','authenticated','supabase_auth_admin','service_role')),'no direct private table grants');
SAVEPOINT authority;
UPDATE private.password_vault_members SET role='editor' WHERE user_id='f7000000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_machine('item.list')->>'error','42501','issuer must remain owner even if epoch unchanged');
ROLLBACK TO authority;
SAVEPOINT epoch;
UPDATE private.password_vaults SET authorization_epoch=authorization_epoch+1 WHERE id='f7200000-0000-0000-0000-000000000001';
SELECT is(pg_temp.pw_machine('item.list')->>'error','42501','epoch invalidates metadata');
SELECT is(pg_temp.pw_machine('request.status','{"request_id":"f7400000-0000-0000-0000-000000000070"}')->>'error','42501','epoch invalidates receipt lookup');
ROLLBACK TO epoch;
SAVEPOINT expiry;
UPDATE private.password_vault_machine_tokens SET created_at=now()-interval '10 minutes',expires_at=now()-interval '1 minute';
SELECT is(pg_temp.pw_machine('item.list')->>'error','42501','expired token cannot enumerate');
ROLLBACK TO expiry;
SAVEPOINT revoke;
UPDATE private.password_vault_machine_grants SET revoked_at=now();
SELECT is(pg_temp.pw_machine('item.list')->>'error','42501','revoked grant cannot enumerate');
ROLLBACK TO revoke;
SAVEPOINT issuer;
INSERT INTO private.password_vault_members(ws_id,vault_id,user_id,role) VALUES
 ('f7100000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000002','owner');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id',gen_random_uuid(),
 'token_digest',repeat('b',64),'expires_at',now()+interval '10 minutes'),
 'f7000000-0000-0000-0000-000000000002')->>'error','42501','another owner cannot issue the configured issuer grant');
ROLLBACK TO issuer;
SAVEPOINT read_scope;
UPDATE private.password_vault_machine_grants SET scopes=ARRAY['item.read'];
SELECT is(pg_temp.pw_machine('item.list')->'vault'->>'role','viewer','read-only metadata never permits writing');
SELECT is(pg_temp.pw_machine('key.read',jsonb_build_object('item_id','f7300000-0000-0000-0000-000000000001',
 'expected_revision',pg_temp.pw_revision(),'expected_item_revision',2))->>'error','42501','read-only cannot obtain write key');
ROLLBACK TO read_scope;
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id','f7600000-0000-0000-0000-000000000002',
 'token_digest',repeat('b',64),'expires_at',now()+interval '10 minutes'))->>'error',NULL,'issue second token in same grant');
SELECT is(pg_temp.pw_op('request.status','{"request_id":"f7400000-0000-0000-0000-000000000070"}',NULL,
 p_token=>'f7600000-0000-0000-0000-000000000002',p_digest=>repeat('b',64))->>'error','42501','second token cannot recover first token receipt');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id',gen_random_uuid(),'scopes',jsonb_build_array('item.read'),
 'item_ids',jsonb_build_array('f7300000-0000-0000-0000-000000000001'),'expires_at',now()+interval '25 hours'))->>'error','23514','grant lifetime is SQL-capped at 24 hours');
SELECT is(pg_temp.pw_op('token.issue',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','f7500000-0000-0000-0000-000000000001','token_id',gen_random_uuid(),
 'token_digest',repeat('c',64),'expires_at',now()+interval '16 minutes'))->>'error','23514','token lifetime is SQL-capped at 15 minutes');
SELECT * FROM finish();
ROLLBACK;
