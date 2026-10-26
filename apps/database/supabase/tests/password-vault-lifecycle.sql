BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
 ('e8000000-0000-0000-0000-000000000001','pw-erase-creator@example.test',now()),
 ('e8000000-0000-0000-0000-000000000002','pw-erase-issuer@example.test',now()),
 ('e8000000-0000-0000-0000-000000000003','pw-erase-member@example.test',now());
INSERT INTO public.workspaces(id,name,personal,creator_id) VALUES
 ('e8100000-0000-0000-0000-000000000001','Passwords erasure fixture',false,'e8000000-0000-0000-0000-000000000001');
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
 ('e8100000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000002','MEMBER'),
 ('e8100000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000003','MEMBER');
CREATE FUNCTION pg_temp.pw_as(p_role text,p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE saved text:=current_setting('role'); value jsonb;
BEGIN
 PERFORM set_config('role',p_role,true);
 BEGIN EXECUTE p_sql INTO value; EXCEPTION WHEN OTHERS THEN value:=jsonb_build_object('error',SQLSTATE); END;
 PERFORM set_config('role',saved,true); RETURN value;
END $$;
CREATE FUNCTION pg_temp.pw_op(p_action text,p_input jsonb,p_actor uuid DEFAULT 'e8000000-0000-0000-0000-000000000001')
 RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.pw_as('service_role',format('SELECT private.password_vault_execute(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L,%L::jsonb)',
 'e8100000-0000-0000-0000-000000000001','e8200000-0000-0000-0000-000000000001',p_actor,gen_random_uuid(),p_action,p_input));
$$;
CREATE FUNCTION pg_temp.pw_revision() RETURNS bigint LANGUAGE sql AS $$
 SELECT revision FROM private.password_vaults WHERE id='e8200000-0000-0000-0000-000000000001';
$$;
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','Erasure fixture','encrypted_data_key',repeat('k',64)))->>'error',NULL,'create erasure fixture');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e8000000-0000-0000-0000-000000000002','role','owner','revoked',false))->>'error',NULL,'admit separate owner/issuer');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e8000000-0000-0000-0000-000000000003','role','viewer','revoked',false))->>'error',NULL,'admit separate viewer');
SELECT is(pg_temp.pw_op('vault.rotate',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'encrypted_data_key',repeat('r',64),'items','[]'::jsonb))->>'error',NULL,'rotate shared fixture');
SELECT is(pg_temp.pw_op('item.write',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','e8300000-0000-0000-0000-000000000001','expected_item_revision',0,'version',2,
 'name','ERASURE_FIXTURE','encrypted_payload',repeat('x',64),'ciphertext_bytes',64))->>'error',NULL,'write synthetic ciphertext');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','e8500000-0000-0000-0000-000000000001','scopes','["item.read"]'::jsonb,
 'item_ids','["e8300000-0000-0000-0000-000000000001"]'::jsonb,'expires_at',now()+interval '1 hour'),
 'e8000000-0000-0000-0000-000000000002')->>'error',NULL,'separate owner creates machine grant');
SAVEPOINT capture_failure;
CREATE FUNCTION pg_temp.fail_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$;
CREATE TRIGGER fail_capture BEFORE INSERT ON private.password_vault_lifecycle_jobs
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_capture();
SELECT lives_ok($q$DELETE FROM auth.users WHERE id='e8000000-0000-0000-0000-000000000002'$q$,
 'outbox failure cannot block a normal account deletion');
SELECT is(pg_temp.pw_op('item.list','{}')->>'error','55000','retained orphan references fail closed even without a captured job');
DROP TRIGGER fail_capture ON private.password_vault_lifecycle_jobs;
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok((SELECT issuer_user_id IS NULL AND revoked_at IS NOT NULL FROM private.password_vault_machine_grants
 WHERE id='e8500000-0000-0000-0000-000000000001'),'bounded reconciliation repairs an uncaptured erased issuer');
ROLLBACK TO capture_failure;
CREATE FUNCTION pg_temp.fail_vault_side() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic vault-side failure'; END $$;
CREATE TRIGGER fail_vault_side BEFORE INSERT ON private.password_vault_audit_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_vault_side();
SELECT lives_ok($q$INSERT INTO auth.users(id,email,email_confirmed_at)
 VALUES('e8000000-0000-0000-0000-000000000004','pw-no-vault@example.test',now())$q$,
 'signup succeeds with no vault rows while vault audit is broken');
SELECT lives_ok($q$UPDATE auth.users SET last_sign_in_at=now()
 WHERE id='e8000000-0000-0000-0000-000000000004'$q$,'ordinary auth update succeeds');
SELECT lives_ok($q$DELETE FROM auth.users WHERE id='e8000000-0000-0000-0000-000000000004'$q$,
 'account erasure with no vault rows succeeds');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($q$UPDATE public.workspace_members SET type='GUEST'
 WHERE ws_id='e8100000-0000-0000-0000-000000000001' AND user_id='e8000000-0000-0000-0000-000000000003'$q$,
 'membership downgrade succeeds without touching failing vault side');
SELECT lives_ok($q$UPDATE public.workspace_members SET type='MEMBER'
 WHERE ws_id='e8100000-0000-0000-0000-000000000001' AND user_id='e8000000-0000-0000-0000-000000000003'$q$,
 'membership restoration succeeds before retry');
SELECT set_config('request.jwt.claims','{}',true);
SELECT is(pg_temp.pw_op('item.list','{}')->>'error','55000','never-running retry leaves vault operations denied');
SELECT lives_ok($q$DELETE FROM auth.users WHERE id='e8000000-0000-0000-0000-000000000002'$q$,
 'grant issuer erasure succeeds while vault side is broken');
SELECT ok(EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs
 WHERE kind='account' AND user_id='e8000000-0000-0000-0000-000000000002' AND completed_at IS NULL),
 'erasure has a durable job without a user FK');
SELECT ok((pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)')->>'failed')::integer>0,
 'retry records an injected vault-side failure without failing its caller');
SELECT lives_ok($q$UPDATE public.workspaces SET name='Write still succeeds'
 WHERE id='e8100000-0000-0000-0000-000000000001'$q$,'workspace update succeeds while retry is broken');
SELECT lives_ok($q$DELETE FROM public.workspaces WHERE id='e8100000-0000-0000-0000-000000000001'$q$,
 'workspace erasure succeeds despite failing vault audit');
DO $$ BEGIN
 FOR i IN 1..5 LOOP
  UPDATE private.password_vault_lifecycle_jobs SET next_attempt_at=clock_timestamp() WHERE completed_at IS NULL;
  PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)');
 END LOOP;
END $$;
SELECT ok(EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs
 WHERE completed_at IS NULL AND attempts=5 AND last_error_code='P0001'),'retries stop after five recorded failures');
SELECT is(pg_temp.pw_op('item.list','{}')->>'error','42501','erased workspace remains denied after terminal failure');
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs WHERE attempts>5),'retry count is bounded');
DROP TRIGGER fail_vault_side ON private.password_vault_audit_events;
UPDATE private.password_vault_lifecycle_jobs SET attempts=0,next_attempt_at=clock_timestamp() WHERE completed_at IS NULL;
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs WHERE completed_at IS NULL),
 'explicit repaired retry drains durable work');
SELECT ok((SELECT ws_id IS NULL AND retired_at IS NOT NULL AND rotation_required
 FROM private.password_vaults WHERE id='e8200000-0000-0000-0000-000000000001'),'retry detaches and retires erased workspace vault');
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_members WHERE revoked_at IS NULL),'retry revokes all erased workspace members');
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_machine_grants WHERE revoked_at IS NULL),'retry revokes machine authority');
SELECT ok((SELECT issuer_user_id IS NULL FROM private.password_vault_machine_grants
 WHERE id='e8500000-0000-0000-0000-000000000001'),'retry clears erased issuer identity');
CREATE TEMP TABLE repaired_state AS SELECT revision,authorization_epoch FROM private.password_vaults
 WHERE id='e8200000-0000-0000-0000-000000000001';
CREATE TEMP TABLE repaired_audit AS SELECT count(*)::integer AS n FROM private.password_vault_audit_events;
SELECT is(pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)')->>'processed','0',
 'repeating a completed retry does no work');
SELECT is((SELECT revision FROM private.password_vaults WHERE id='e8200000-0000-0000-0000-000000000001'),
 (SELECT revision FROM repaired_state),'idempotent retry preserves revision');
SELECT is((SELECT count(*)::integer FROM private.password_vault_audit_events),(SELECT n FROM repaired_audit),
 'idempotent retry does not duplicate audit');
SELECT ok(NOT has_table_privilege(role,'private.password_vault_lifecycle_jobs','SELECT,INSERT,UPDATE,DELETE'),
 role||' cannot access lifecycle jobs directly') FROM (VALUES('anon'),('authenticated'),('supabase_auth_admin'),('service_role')) r(role);
SELECT is(pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(0)')->>'error','22023',
 'retry refuses an unbounded/invalid batch');
SELECT * FROM finish();
ROLLBACK;
