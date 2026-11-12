BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions, pg_temp;
SELECT plan(32);
SET LOCAL request.jwt.claims = '{}';

INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
 ('10000000-0000-4000-8000-000000000001', 'creator@example.test', now()),
 ('10000000-0000-4000-8000-000000000002', 'member@example.test', now()),
 ('10000000-0000-4000-8000-000000000003', 'Email@example.test', now()),
 ('10000000-0000-4000-8000-000000000004', 'unconfirmed@example.test', NULL),
 ('10000000-0000-4000-8000-000000000005', 'other@example.test', now());
INSERT INTO public.users(id) SELECT id FROM auth.users
 WHERE id::text LIKE '10000000-0000-4000-8000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces(id, name, personal, creator_id) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', 'Synthetic invitation fixture', false,
 '10000000-0000-4000-8000-000000000001');
INSERT INTO private.workspace_subscription_products(id, tier, pricing_model, price, archived)
 VALUES ('30000000-0000-4000-8000-000000000001', 'FREE', 'free', 0, false);
INSERT INTO public.workspace_subscriptions(ws_id, polar_subscription_id, product_id, status)
 VALUES ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active');
INSERT INTO public.workspace_roles(id, ws_id, name) VALUES
 ('20000000-0000-4000-8000-000000000001', 'a65cebd7-3a8c-4883-a3d9-82f9703d652f', 'Synthetic invited role');
INSERT INTO public.workspace_roles(id, ws_id, name) VALUES
 ('20000000-0000-4000-8000-000000000002', 'a65cebd7-3a8c-4883-a3d9-82f9703d652f', 'Synthetic second role');

CREATE FUNCTION pg_temp.accept_invite(actor uuid, app text DEFAULT 'ieeai-stats',
 ws uuid DEFAULT 'a65cebd7-3a8c-4883-a3d9-82f9703d652f',
 allowed uuid[] DEFAULT ARRAY['a65cebd7-3a8c-4883-a3d9-82f9703d652f'::uuid])
RETURNS boolean LANGUAGE sql AS $$
 SELECT private.accept_ieeai_free_workspace_invite(app, ws, actor, allowed);
$$;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
INSERT INTO public.workspace_invites(ws_id, user_id, type, role_id) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', '10000000-0000-4000-8000-000000000002', 'MEMBER', '20000000-0000-4000-8000-000000000001');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002', 'other-app'), false, 'wrong app denied');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002', 'ieeai-stats', 'a65cebd7-3a8c-4883-a3d9-82f9703d652f', ARRAY[]::uuid[]), false, 'unlinked workspace denied');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002', 'ieeai-stats', '90000000-0000-4000-8000-000000000001'), false, 'wrong workspace denied');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000005'), false, 'uninvited actor denied');
UPDATE private.workspace_subscription_products SET pricing_model='seat_based', tier='PRO', price=1900 WHERE id='30000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'paid seats denied');
UPDATE private.workspace_subscription_products SET pricing_model='free', tier='FREE', price=0 WHERE id='30000000-0000-4000-8000-000000000001';
UPDATE public.workspace_subscriptions SET status='canceled' WHERE polar_subscription_id='40000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'missing active entitlement denied');
UPDATE public.workspace_subscriptions SET status='active' WHERE polar_subscription_id='40000000-0000-4000-8000-000000000001';
UPDATE public.workspace_subscriptions SET product_id=NULL WHERE polar_subscription_id='40000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'missing product is unknown');
UPDATE public.workspace_subscriptions SET product_id='30000000-0000-4000-8000-000000000001' WHERE polar_subscription_id='40000000-0000-4000-8000-000000000001';
INSERT INTO public.workspace_subscriptions(ws_id, polar_subscription_id, product_id, status)
 VALUES ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'active');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'multiple current subscriptions denied');
DELETE FROM public.workspace_subscriptions WHERE polar_subscription_id='40000000-0000-4000-8000-000000000002';
INSERT INTO private.pending_invitation_seat_revocations(ws_id,user_id,seat_id,last_error)
 VALUES ('a65cebd7-3a8c-4883-a3d9-82f9703d652f','10000000-0000-4000-8000-000000000002','synthetic-seat','Synthetic pending reconciliation');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'pending seat reconciliation denied');
DELETE FROM private.pending_invitation_seat_revocations WHERE seat_id='synthetic-seat';
UPDATE public.workspace_invites SET type='GUEST', role_id=NULL WHERE user_id='10000000-0000-4000-8000-000000000002';
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), false, 'guest remains pending');
UPDATE public.workspace_invites SET type='MEMBER', role_id='20000000-0000-4000-8000-000000000001' WHERE user_id='10000000-0000-4000-8000-000000000002';
SELECT is((SELECT count(*)::integer FROM private.ieeai_invite_acceptances), 0, 'denials have no audit');
SELECT is((SELECT count(*)::integer FROM public.workspace_members WHERE user_id='10000000-0000-4000-8000-000000000002' AND ws_id='a65cebd7-3a8c-4883-a3d9-82f9703d652f'), 0, 'denials have no membership');

CREATE FUNCTION pg_temp.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'synthetic audit failure'; END;
$$;
CREATE TRIGGER synthetic_fail_audit BEFORE INSERT ON private.ieeai_invite_acceptances
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_audit();
SELECT throws_ok($$SELECT pg_temp.accept_invite('10000000-0000-4000-8000-000000000002')$$, 'P0001', 'synthetic audit failure', 'audit failure aborts acceptance');
SELECT is((SELECT count(*)::integer FROM public.workspace_invites WHERE user_id='10000000-0000-4000-8000-000000000002'), 1, 'failed acceptance retains invite');
SELECT is((SELECT count(*)::integer FROM public.workspace_members WHERE user_id='10000000-0000-4000-8000-000000000002' AND ws_id='a65cebd7-3a8c-4883-a3d9-82f9703d652f'), 0, 'failed acceptance has no membership');
DROP TRIGGER synthetic_fail_audit ON private.ieeai_invite_acceptances;
INSERT INTO public.workspace_invite_roles(ws_id,user_id,role_id) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'),
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), true, 'free direct member invite accepted');
SELECT is((SELECT count(*)::integer FROM public.workspace_role_members WHERE user_id='10000000-0000-4000-8000-000000000002' AND role_id='20000000-0000-4000-8000-000000000001'), 1, 'exact invited role assigned');
SELECT is((SELECT count(*)::integer FROM public.workspace_role_members WHERE user_id='10000000-0000-4000-8000-000000000002' AND role_id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')), 2, 'both invited roles assigned');
SELECT is((SELECT cardinality(role_ids) FROM private.ieeai_invite_acceptances WHERE actor_id='10000000-0000-4000-8000-000000000002'), 2, 'audit binds exact role set');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000002'), true, 'existing member retry succeeds');
SELECT is((SELECT count(*)::integer FROM private.ieeai_invite_acceptances WHERE actor_id='10000000-0000-4000-8000-000000000002' AND app_id='ieeai-stats' AND workspace_id='a65cebd7-3a8c-4883-a3d9-82f9703d652f'), 1, 'retry has one actor/app/workspace audit');
SELECT is((SELECT count(*)::integer FROM public.workspace_invites WHERE user_id='10000000-0000-4000-8000-000000000002'), 0, 'only accepted direct invite removed');

INSERT INTO public.workspace_email_invites(ws_id, email, type, role_id) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', 'EMAIL@example.test', 'MEMBER', '20000000-0000-4000-8000-000000000001'),
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', 'unconfirmed@example.test', 'MEMBER', NULL),
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', '0ther@example.test', 'MEMBER', NULL);
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000004'), false, 'unconfirmed auth denied');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000005'), false, 'look-alike email denied');
INSERT INTO public.workspace_invites(ws_id, user_id, type) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f', '10000000-0000-4000-8000-000000000003', 'MEMBER');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000003'), false, 'direct plus email conflict denied');
DELETE FROM public.workspace_invites WHERE user_id='10000000-0000-4000-8000-000000000003';
INSERT INTO public.workspace_email_invites(ws_id,email,type) VALUES
 ('a65cebd7-3a8c-4883-a3d9-82f9703d652f','email@example.test','MEMBER');
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000003'), false, 'case-variant invitation ambiguity denied');
DELETE FROM public.workspace_email_invites WHERE ws_id='a65cebd7-3a8c-4883-a3d9-82f9703d652f' AND email='email@example.test';
SELECT is(pg_temp.accept_invite('10000000-0000-4000-8000-000000000003'), true, 'case normalized confirmed email accepted');
SELECT is((SELECT count(*)::integer FROM public.workspace_email_invites WHERE ws_id='a65cebd7-3a8c-4883-a3d9-82f9703d652f'), 2, 'unrelated email invites retained');
SELECT is((SELECT count(*)::integer FROM public.workspace_role_members WHERE user_id='10000000-0000-4000-8000-000000000003' AND role_id='20000000-0000-4000-8000-000000000001'), 1, 'email invited role retained');
SELECT ok(NOT has_function_privilege('authenticated', 'private.accept_ieeai_free_workspace_invite(text,uuid,uuid,uuid[])', 'EXECUTE'), 'authenticated cannot call RPC');
SELECT ok(NOT has_function_privilege('anon', 'private.accept_ieeai_free_workspace_invite(text,uuid,uuid,uuid[])', 'EXECUTE'), 'anonymous cannot call RPC');
SELECT ok(NOT has_table_privilege('service_role', 'private.ieeai_invite_acceptances', 'INSERT'), 'service cannot forge audit directly');
SELECT * FROM finish();
ROLLBACK;
