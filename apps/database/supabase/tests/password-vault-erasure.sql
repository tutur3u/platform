BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
 ('e7000000-0000-0000-0000-000000000001','pw-erase-creator@example.test',now()),
 ('e7000000-0000-0000-0000-000000000002','pw-erase-issuer@example.test',now()),
 ('e7000000-0000-0000-0000-000000000003','pw-erase-member@example.test',now());
INSERT INTO public.workspaces(id,name,personal,creator_id) VALUES
 ('e7100000-0000-0000-0000-000000000001','Passwords erasure fixture',false,'e7000000-0000-0000-0000-000000000001');
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
 ('e7100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000002','MEMBER'),
 ('e7100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000003','MEMBER');
CREATE FUNCTION pg_temp.pw_as(p_role text,p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE saved text:=current_setting('role'); value jsonb;
BEGIN
 PERFORM set_config('role',p_role,true);
 BEGIN EXECUTE p_sql INTO value; EXCEPTION WHEN OTHERS THEN value:=jsonb_build_object('error',SQLSTATE); END;
 PERFORM set_config('role',saved,true); RETURN value;
END $$;
CREATE FUNCTION pg_temp.pw_op(p_action text,p_input jsonb,p_actor uuid DEFAULT 'e7000000-0000-0000-0000-000000000001')
 RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.pw_as('service_role',format('SELECT private.password_vault_execute(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L,%L::jsonb)',
 'e7100000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001',p_actor,gen_random_uuid(),p_action,p_input));
$$;
CREATE FUNCTION pg_temp.pw_revision() RETURNS bigint LANGUAGE sql AS $$
 SELECT revision FROM private.password_vaults WHERE id='e7200000-0000-0000-0000-000000000001';
$$;
SELECT is(pg_temp.pw_op('vault.create',jsonb_build_object('label','Erasure fixture','encrypted_data_key',repeat('k',64)))->>'error',NULL,'create erasure fixture');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e7000000-0000-0000-0000-000000000002','role','owner','revoked',false))->>'error',NULL,'admit separate owner/issuer');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e7000000-0000-0000-0000-000000000003','role','viewer','revoked',false))->>'error',NULL,'admit separate viewer');
SELECT is(pg_temp.pw_op('vault.rotate',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'encrypted_data_key',repeat('r',64),'items','[]'::jsonb))->>'error',NULL,'rotate shared fixture');
SELECT is(pg_temp.pw_op('item.write',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'item_id','e7300000-0000-0000-0000-000000000001','expected_item_revision',0,'version',2,
 'name','ERASURE_FIXTURE','encrypted_payload',repeat('x',64),'ciphertext_bytes',64))->>'error',NULL,'write synthetic ciphertext');
SELECT is(pg_temp.pw_op('grant.create',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'grant_id','e7500000-0000-0000-0000-000000000001','scopes','["item.read"]'::jsonb,
 'item_ids','["e7300000-0000-0000-0000-000000000001"]'::jsonb,'expires_at',now()+interval '1 hour'),
 'e7000000-0000-0000-0000-000000000002')->>'error',NULL,'separate owner creates machine grant');
CREATE TEMP TABLE old_audit AS SELECT id,metadata FROM private.password_vault_audit_events;
SAVEPOINT member_erasure;
SELECT is(pg_temp.pw_as('supabase_auth_admin',$$DELETE FROM auth.users WHERE id='e7000000-0000-0000-0000-000000000003' RETURNING jsonb_build_object('id',id)$$)->>'error',NULL,'auth admin member self-delete succeeds');
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok(NOT EXISTS(SELECT 1 FROM auth.users WHERE id='e7000000-0000-0000-0000-000000000003'),'member account removed');
SELECT is((SELECT count(*)::integer FROM private.password_vault_members WHERE user_id IS NULL AND revoked_at IS NOT NULL),1,'deleted member link nulled and revoked');
SELECT is((SELECT count(*)::integer FROM old_audit o JOIN private.password_vault_audit_events a USING(id) WHERE o.metadata=a.metadata),(SELECT count(*)::integer FROM old_audit),'prior audit retained unchanged');
SELECT ok(EXISTS(SELECT 1 FROM private.password_vault_audit_events WHERE event_type='member.account_erased' AND actor_user_id='e7000000-0000-0000-0000-000000000003'),'erasure audited with historical opaque actor');
SELECT is(jsonb_array_length(pg_temp.pw_op('member.list','{}')->'members'),2,'member list excludes erased identity links');
ROLLBACK TO member_erasure;
SAVEPOINT creator_erasure;
SELECT is(pg_temp.pw_as('supabase_auth_admin',$$DELETE FROM auth.users WHERE id='e7000000-0000-0000-0000-000000000001' RETURNING jsonb_build_object('id',id)$$)->>'error',NULL,'creator self-delete succeeds');
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok((SELECT created_by IS NULL AND rotation_required FROM private.password_vaults WHERE id='e7200000-0000-0000-0000-000000000001'),'creator link nulled and remaining owners must rotate');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"e7300000-0000-0000-0000-000000000001"}','e7000000-0000-0000-0000-000000000002')->>'error','55000','surviving owner cannot reveal before rotation');
ROLLBACK TO creator_erasure;
SAVEPOINT issuer_erasure;
SELECT is(pg_temp.pw_as('supabase_auth_admin',$$DELETE FROM auth.users WHERE id='e7000000-0000-0000-0000-000000000002' RETURNING jsonb_build_object('id',id)$$)->>'error',NULL,'grant issuer self-delete succeeds');
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok((SELECT issuer_user_id IS NULL AND revoked_at IS NOT NULL FROM private.password_vault_machine_grants WHERE id='e7500000-0000-0000-0000-000000000001'),'issuer link nulled and grant revoked');
ROLLBACK TO issuer_erasure;
SAVEPOINT last_owner;
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e7000000-0000-0000-0000-000000000002','role','owner','revoked',true))->>'error',NULL,'remove secondary owner');
SELECT is(pg_temp.pw_op('member.set',jsonb_build_object('expected_revision',pg_temp.pw_revision(),
 'user_id','e7000000-0000-0000-0000-000000000001','role','viewer','revoked',true))->>'error','23514','ordinary sharing cannot revoke last owner');
SELECT is(pg_temp.pw_as('supabase_auth_admin',$$DELETE FROM auth.users WHERE id='e7000000-0000-0000-0000-000000000001' RETURNING jsonb_build_object('id',id)$$)->>'error',NULL,'last owner may delete their account');
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT is((SELECT count(*)::integer FROM private.password_vault_members WHERE role='owner' AND revoked_at IS NULL AND user_id IS NOT NULL),0,'ownerless vault does not transfer authority');
SELECT is(pg_temp.pw_op('item.read','{"item_id":"e7300000-0000-0000-0000-000000000001"}','e7000000-0000-0000-0000-000000000003')->>'error','55000','remaining viewer is frozen');
ROLLBACK TO last_owner;
SELECT is(pg_temp.pw_as('service_role',$$DELETE FROM public.workspaces WHERE id='e7100000-0000-0000-0000-000000000001' RETURNING jsonb_build_object('id',id)$$)->>'error',NULL,'service workspace hard delete succeeds with a vault');
DO $$ BEGIN PERFORM pg_temp.pw_as('service_role','SELECT private.password_vault_retry_lifecycle(25)'); END $$;
SELECT ok(NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id='e7100000-0000-0000-0000-000000000001'),'workspace row removed');
SELECT ok((SELECT ws_id IS NULL AND scope_ws_id='e7100000-0000-0000-0000-000000000001' AND retired_at IS NOT NULL AND rotation_required FROM private.password_vaults WHERE id='e7200000-0000-0000-0000-000000000001'),'vault detached and retired with encryption context intact');
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_members WHERE revoked_at IS NULL),'all retired-vault members revoked');
SELECT ok(NOT EXISTS(SELECT 1 FROM private.password_vault_machine_grants WHERE revoked_at IS NULL),'all retired-vault grants revoked');
SELECT is((SELECT count(*)::integer FROM old_audit o JOIN private.password_vault_audit_events a USING(id) WHERE o.metadata=a.metadata),(SELECT count(*)::integer FROM old_audit),'workspace erasure retains prior audit rows');
SELECT ok(EXISTS(SELECT 1 FROM private.password_vault_audit_events WHERE event_type='vault.workspace_erased'),'workspace erasure appends a system audit event');
SELECT is(pg_temp.pw_op('item.list','{}')->>'error','42501','detached vault cannot be accessed through the erased workspace');
SELECT * FROM finish();
ROLLBACK;
