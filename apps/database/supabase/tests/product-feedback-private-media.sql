BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(17);
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='private.product_feedback_media'::regclass),'private media enables RLS');
SELECT ok(NOT has_table_privilege('authenticated','private.product_feedback_media','SELECT'),'reporter cannot read media table');
SELECT ok(NOT has_table_privilege('anon','private.product_feedback_media','SELECT'),'anonymous cannot read media table');
SELECT ok(NOT has_function_privilege('authenticated','public.submit_product_feedback_with_media(uuid,uuid,text,text,text)','EXECUTE'),'authenticated cannot call service intake');
SELECT ok(NOT has_function_privilege('authenticated','public.get_product_feedback_media_staff(uuid,uuid)','EXECUTE'),'authenticated cannot call staff media RPC');
DELETE FROM private.security_budget_counters WHERE key LIKE 'api-cost:v1:product-feedback:%';
INSERT INTO auth.users(id,email) VALUES ('90510000-0000-4000-8000-000000000001','feedback-media@example.test');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE media_fixture AS SELECT public.submit_product_feedback_with_media(
 '90510000-0000-4000-8000-000000000001','90510000-0000-4000-8000-000000000101','Subject','Details','UklGRgAAAABXRUJQ') AS result;
SELECT is((SELECT result->>'status' FROM media_fixture),'accepted','text and service-normalized image accepted');
SELECT is((SELECT count(*)::int FROM private.product_feedback_media WHERE report_id=(SELECT (result->'receipt'->>'id')::uuid FROM media_fixture)),1,'one screenshot bound to exact receipt');
SELECT is(public.submit_product_feedback_with_media('90510000-0000-4000-8000-000000000001','90510000-0000-4000-8000-000000000101','Subject','Details','UklGRgAAAABXRUJQ'),(SELECT result FROM media_fixture),'identical screenshot replay returns exact receipt');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters WHERE key LIKE 'api-cost:v1:product-feedback:%'),3,'replay has no additional quota charge');
SELECT is(public.submit_product_feedback_with_media('90510000-0000-4000-8000-000000000001','90510000-0000-4000-8000-000000000101','Subject','Details',null)->>'status','conflict','cannot remove screenshot on replay');
SELECT is(public.submit_product_feedback_with_media('90510000-0000-4000-8000-000000000001','90510000-0000-4000-8000-000000000101','Subject','Details','UklGRgEAAABXRUJQ')->>'status','conflict','changed screenshot conflicts');
SELECT throws_ok($$SELECT public.submit_product_feedback_with_media('90510000-0000-4000-8000-000000000001','90510000-0000-4000-8000-000000000102','Subject','Details','PHN2Zz4=')$$,'22023','Invalid feedback media','reject non-raster envelope before quota');
SELECT throws_ok($$SELECT public.get_product_feedback_media_staff('90510000-0000-4000-8000-000000000001',(SELECT (result->'receipt'->>'id')::uuid FROM media_fixture))$$,'PT403','Feedback forbidden','ordinary submitter denied private staff media');
SELECT is((SELECT count(*)::int FROM private.product_feedback_reports WHERE actor_id='90510000-0000-4000-8000-000000000001'),1,'invalid media/conflicts create no extra reports');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters WHERE key LIKE 'api-cost:v1:product-feedback:%'),3,'invalid media/conflicts charge no quota');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('90510000-0000-4000-8000-000000000002','feedback-media-staff@tuturuuu.com',now());
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
INSERT INTO private.infrastructure_employees(user_id,staff_email,managed_name,lifecycle_state) VALUES ('90510000-0000-4000-8000-000000000002','feedback-media-staff@tuturuuu.com','Synthetic staff','active');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":true}'::jsonb WHERE id='90510000-0000-4000-8000-000000000002';
SELECT is(public.get_product_feedback_media_staff('90510000-0000-4000-8000-000000000002',(SELECT (result->'receipt'->>'id')::uuid FROM media_fixture))->>'data','UklGRgAAAABXRUJQ','activated staff reads exact private screenshot');
UPDATE private.infrastructure_employees SET lifecycle_state='pending' WHERE user_id='90510000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT public.get_product_feedback_media_staff('90510000-0000-4000-8000-000000000002',(SELECT (result->'receipt'->>'id')::uuid FROM media_fixture))$$,'PT403','Feedback forbidden','revoked activation denies next media read');
SELECT * FROM finish();
ROLLBACK;
