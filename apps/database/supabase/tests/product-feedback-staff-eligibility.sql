-- UNEXECUTED future TAP proof. Requires separately admitted disposable PostgreSQL,
-- complete canonical registry/history/source union, intake160000, staff170000,
-- then wrapper20261008020000. Never bootstrap/adopt a replacement registry.
-- Fixture columns/profile/platform-role creation reuse the existing staff41
-- packet and canonical identity migration; their actual compatibility is UNPROVED.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(30);
SELECT ok(has_function_privilege('service_role','public.check_product_feedback_staff_eligibility(uuid)','EXECUTE'),'service wrapper grant');
SELECT ok(NOT has_function_privilege('anon','public.check_product_feedback_staff_eligibility(uuid)','EXECUTE'),'anonymous wrapper closed');
SELECT ok(NOT has_function_privilege('authenticated','public.check_product_feedback_staff_eligibility(uuid)','EXECUTE'),'authenticated wrapper closed');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
 WHERE p.oid='public.check_product_feedback_staff_eligibility(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC wrapper closed');
SELECT ok(NOT has_function_privilege('service_role','private.assert_product_feedback_staff(uuid)','EXECUTE'),'no service helper grant');
SELECT ok(NOT has_function_privilege('authenticated','private.assert_product_feedback_staff(uuid)','EXECUTE'),'no authenticated helper grant');
SELECT ok(NOT has_function_privilege('anon','private.assert_product_feedback_staff(uuid)','EXECUTE'),'no anonymous helper grant');
SELECT ok(NOT has_table_privilege('authenticated','private.product_feedback_reports','SELECT'),'report ACL unchanged');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='public.check_product_feedback_staff_eligibility(uuid)'::regprocedure),'security definer wrapper');
SELECT ok((SELECT proconfig @> ARRAY['search_path=""','statement_timeout=3s','lock_timeout=500ms']
 FROM pg_catalog.pg_proc WHERE oid='public.check_product_feedback_staff_eligibility(uuid)'::regprocedure),'empty search path and bounded settings');
SELECT ok(pg_catalog.pg_get_functiondef('public.check_product_feedback_staff_eligibility(uuid)'::regprocedure)
 LIKE '%PERFORM private.assert_product_feedback_staff(p_actor);%','existing assertion invoked');

CREATE TEMP TABLE eligibility_reports_before AS
 SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.id)::text,'')) AS digest
 FROM private.product_feedback_reports r;
-- Synthetic ordinary identities only. No provider/mail/lifecycle RPC or root grant.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('91800000-0000-4000-8000-000000000001','eligibility-fixture@tuturuuu.com',now()),
 ('91800000-0000-4000-8000-000000000002','eligibility-unregistered@tuturuuu.com',now());
INSERT INTO private.infrastructure_employees(user_id,staff_email,managed_name,lifecycle_state)
 VALUES ('91800000-0000-4000-8000-000000000001','eligibility-fixture@tuturuuu.com','Synthetic eligibility','active');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":true}'::jsonb
 WHERE id IN ('91800000-0000-4000-8000-000000000001','91800000-0000-4000-8000-000000000002');
SELECT is((SELECT enabled FROM public.platform_user_roles WHERE user_id='91800000-0000-4000-8000-000000000001'),false,'ordinary platform disabled fixture');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id='91800000-0000-4000-8000-000000000001'),'no workspace or root membership');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001'),'{"eligible":true}'::jsonb,'actual service wrapper exact content-free result');
RESET ROLE;
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000002')$$,'PT403','Feedback forbidden','missing registry denies');
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility(NULL)$$,'PT403','Feedback forbidden','null actor denies');
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000099')$$,'PT403','Feedback forbidden','absent actor denies');
UPDATE private.infrastructure_employees SET lifecycle_state='pending' WHERE user_id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','pending denies');
UPDATE private.infrastructure_employees SET lifecycle_state='provisioned' WHERE user_id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','provisioned denies');
UPDATE private.infrastructure_employees SET lifecycle_state='active' WHERE user_id='91800000-0000-4000-8000-000000000001';
UPDATE auth.users SET email='eligibility-changed@tuturuuu.com' WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','current email tuple mismatch denies');
UPDATE auth.users SET email='eligibility-fixture@tuturuuu.com',banned_until=now()+interval '1 day' WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','ban denies next call');
UPDATE auth.users SET banned_until=null,email_confirmed_at=null WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','unverified denies');
UPDATE auth.users SET email_confirmed_at=now(),raw_app_meta_data='{"employee_onboarding":false}'::jsonb WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','false marker denies');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":null}'::jsonb WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','null marker denies');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":"true"}'::jsonb WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','string marker denies');
UPDATE auth.users SET raw_app_meta_data='{}'::jsonb WHERE id='91800000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','missing marker denies');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":true}'::jsonb WHERE id='91800000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'42501','Service role required','helper checks current role claims');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'42501',NULL,'actual authenticated role ACL denies');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.check_product_feedback_staff_eligibility('91800000-0000-4000-8000-000000000001')$$,'42501',NULL,'actual anonymous role ACL denies');
RESET ROLE;
SELECT is((SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.id)::text,''))
 FROM private.product_feedback_reports r),(SELECT digest FROM eligibility_reports_before),'no report side effects');
SELECT * FROM finish();
ROLLBACK;
-- Future admitted SQL causal controls must remove helper admission conjuncts only
-- in disposable copies, observe targeted TAP RED and restore exact source GREEN.
-- This packet proves neither committed concurrent revocation nor MVCC overlap.
