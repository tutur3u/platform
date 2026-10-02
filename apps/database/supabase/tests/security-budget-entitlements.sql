BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Existing disposable seed actors; all membership edits roll back.
DELETE FROM public.workspace_members WHERE user_id='00000000-0000-0000-0000-000000000003';
INSERT INTO public.workspaces(id,name,personal,creator_id)
SELECT '00000000-0000-4000-8000-000000098001','Entitlement personal',true,'00000000-0000-0000-0000-000000000003'
WHERE NOT EXISTS (SELECT 1 FROM public.workspaces WHERE personal AND creator_id='00000000-0000-0000-0000-000000000003');
CREATE TEMP TABLE entitlement_personal AS SELECT id FROM public.workspaces WHERE personal AND creator_id='00000000-0000-0000-0000-000000000003';
INSERT INTO public.workspaces(id,name,personal,creator_id) VALUES
('00000000-0000-4000-8000-000000098002','Entitlement paid',false,'00000000-0000-0000-0000-000000000001'),
('00000000-0000-4000-8000-000000098003','Entitlement trial',false,'00000000-0000-0000-0000-000000000001'),
('00000000-0000-4000-8000-000000098004','Entitlement unrelated free',false,'00000000-0000-0000-0000-000000000001');
INSERT INTO private.workspace_subscription_products(id,tier,pricing_model,price) VALUES
('00000000-0000-4000-8000-000000098901','PLUS','fixed',9),
('00000000-0000-4000-8000-000000098902','PRO','fixed',19),
('00000000-0000-4000-8000-000000098903','ENTERPRISE','free',0);
INSERT INTO public.workspace_subscriptions(ws_id,product_id,status,polar_subscription_id,current_period_end) VALUES
('00000000-0000-4000-8000-000000098002','00000000-0000-4000-8000-000000098902','active','test-only-security-pro',now()+interval '1 day'),
('00000000-0000-4000-8000-000000098003','00000000-0000-4000-8000-000000098902','trialing','test-only-security-trial',now()+interval '1 day'),
('00000000-0000-4000-8000-000000098004','00000000-0000-4000-8000-000000098903','active','test-only-security-free',now()+interval '1 day');
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'tier','FREE','unjoined paid workspace does not grant account uplift');
SELECT is(public.get_security_budget_entitlement('00000000-0000-4000-8000-000000098002',NULL)->>'tier','PRO','public CMS uses the target paid workspace');
INSERT INTO public.workspace_members(ws_id,user_id) VALUES
('00000000-0000-4000-8000-000000098002','00000000-0000-0000-0000-000000000003'),
('00000000-0000-4000-8000-000000098003','00000000-0000-0000-0000-000000000003');
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'tier','PRO','current paid membership grants account uplift');
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'paidWorkspaceCount','1','trialing memberships do not count as paid');
SELECT is(public.get_security_budget_entitlement((SELECT id FROM entitlement_personal),NULL)->>'tier','PRO','personal workspace inherits owner paid memberships');
SELECT is(public.get_security_budget_entitlement('00000000-0000-4000-8000-000000098004',NULL)->>'tier','FREE','zero-cost enterprise labels confer no paid uplift');
INSERT INTO public.workspace_subscriptions(ws_id,product_id,status,polar_subscription_id,current_period_end)
SELECT id,'00000000-0000-4000-8000-000000098901','active','test-only-security-personal',now()+interval '1 day' FROM entitlement_personal;
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'paidWorkspaceCount','2','personal and joined paid workspaces both count once');
INSERT INTO public.workspace_subscriptions(ws_id,product_id,status,polar_subscription_id,current_period_end) VALUES
('00000000-0000-4000-8000-000000098002','00000000-0000-4000-8000-000000098902','active','test-only-security-duplicate',now()+interval '1 day');
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'paidWorkspaceCount','2','duplicate subscription records cannot inflate workspace count');
DELETE FROM public.workspace_members WHERE ws_id='00000000-0000-4000-8000-000000098002' AND user_id='00000000-0000-0000-0000-000000000003';
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'tier','PLUS','removed memberships stop granting the higher tier');
UPDATE public.workspace_subscriptions SET current_period_end=now()-interval '1 second' WHERE polar_subscription_id='test-only-security-personal';
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'tier','FREE','expired paid periods do not grant uplift');
UPDATE public.workspace_subscriptions SET current_period_end=now()+interval '1 day',status='past_due' WHERE polar_subscription_id='test-only-security-personal';
SELECT is(public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')->>'tier','FREE','past due records do not confer paid allowances');
UPDATE public.workspaces SET deleted=true WHERE id='00000000-0000-4000-8000-000000098002';
SELECT is(public.get_security_budget_entitlement('00000000-0000-4000-8000-000000098002',NULL)->>'tier','FREE','deleted workspaces do not grant uplift');
SELECT ok(NOT has_function_privilege('anon','public.get_security_budget_entitlement(uuid,uuid)','EXECUTE'),'anonymous callers cannot query entitlements');
SELECT ok(NOT has_function_privilege('authenticated','public.get_security_budget_entitlement(uuid,uuid)','EXECUTE'),'users cannot impersonate entitlement subjects');
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.get_security_budget_entitlement(NULL,'00000000-0000-0000-0000-000000000003')$$,'42501','Service role required','service-only identity boundary enforced');
SELECT * FROM finish();
ROLLBACK;
