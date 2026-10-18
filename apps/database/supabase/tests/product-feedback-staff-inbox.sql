-- UNEXECUTED. Requires root-admitted disposable historical source union including
-- the canonical employee registry chain, original intake and staff migration.
-- Synthetic fixture only, full transaction rollback, no registry auto-adoption.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(41);
SELECT ok(NOT has_schema_privilege('authenticated','private','USAGE'),'private schema stays closed');
SELECT ok(NOT has_table_privilege('authenticated','private.product_feedback_reports','SELECT'),'no authenticated report reads');
SELECT ok(NOT has_table_privilege('anon','private.product_feedback_reports','SELECT'),'no anonymous report reads');
SELECT ok(NOT has_table_privilege('authenticated','private.product_feedback_reports','UPDATE'),'no authenticated transitions');
SELECT ok(NOT has_function_privilege('authenticated','public.list_product_feedback_staff(uuid,text,text,text,integer,timestamptz,uuid)','EXECUTE'),'list is service-only');
SELECT ok(NOT has_function_privilege('anon','public.get_product_feedback_staff(uuid,uuid)','EXECUTE'),'detail is service-only');
SELECT ok(NOT has_function_privilege('authenticated','private.assert_product_feedback_staff(uuid)','EXECUTE'),'private helper unavailable');
SELECT ok(has_function_privilege('service_role','public.list_product_feedback_staff(uuid,text,text,text,integer,timestamptz,uuid)','EXECUTE'),'service list grant');
SELECT ok(has_function_privilege('service_role','public.get_product_feedback_staff(uuid,uuid)','EXECUTE'),'service detail grant');

-- Insert ordinary identities first; test-only canonical enrollment is explicit.
-- No provider, employee lifecycle RPC, mail or external hook is invoked here.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('91600000-0000-4000-8000-000000000001','staff-fixture@tuturuuu.com',now()),
 ('91600000-0000-4000-8000-000000000002','unregistered-fixture@tuturuuu.com',now());
INSERT INTO private.infrastructure_employees(user_id,staff_email,managed_name,lifecycle_state)
 VALUES ('91600000-0000-4000-8000-000000000001','staff-fixture@tuturuuu.com','Synthetic staff','active');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":true}'::jsonb
 WHERE id IN ('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'active ordinary staff allowed');
SELECT is((SELECT enabled FROM public.platform_user_roles WHERE user_id='91600000-0000-4000-8000-000000000001'),false,'ordinary enabled=false is allowed');
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000002')$$,'PT403','Feedback forbidden','missing registry denies');
UPDATE private.infrastructure_employees SET lifecycle_state='pending' WHERE user_id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','inbox',null,'',25,null,null)$$,'PT403','Feedback forbidden','pending final list denies');
UPDATE private.infrastructure_employees SET lifecycle_state='provisioned' WHERE user_id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT public.get_product_feedback_staff('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000103')$$,'PT403','Feedback forbidden','provisioned final detail denies');
UPDATE private.infrastructure_employees SET lifecycle_state='active' WHERE user_id='91600000-0000-4000-8000-000000000001';
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','ban revokes next read');
UPDATE auth.users SET banned_until=null,email_confirmed_at=null WHERE id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','unverified denies');
UPDATE auth.users SET email_confirmed_at=now(),raw_app_meta_data='{"employee_onboarding":"true"}'::jsonb WHERE id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','string marker denies');
UPDATE auth.users SET raw_app_meta_data='{"employee_onboarding":true}'::jsonb,email='other-fixture@tuturuuu.com' WHERE id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','email tuple mismatch denies');
UPDATE auth.users SET email='staff-fixture@xwf.tuturuuu.com' WHERE id='91600000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT private.assert_product_feedback_staff('91600000-0000-4000-8000-000000000001')$$,'PT403','Feedback forbidden','subdomain denies');
UPDATE auth.users SET email='staff-fixture@tuturuuu.com' WHERE id='91600000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','inbox',null,'',25,null,null)$$,'42501','Service role required','function role guard denies even elevated caller with non-service claims');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

INSERT INTO private.product_feedback_reports(id,actor_id,title,body,created_at) VALUES
 ('91600000-0000-4000-8000-000000000103','91600000-0000-4000-8000-000000000001','Literal %_\ title','Private synthetic body','2026-10-07T17:00:00.000001Z'),
 ('91600000-0000-4000-8000-000000000102','91600000-0000-4000-8000-000000000001','Another title','Private other body','2026-10-07T17:00:00.000001Z'),
 ('91600000-0000-4000-8000-000000000101','91600000-0000-4000-8000-000000000001','Resolved title','Private resolved body','2026-10-07T17:00:00.000001Z'),
 ('91600000-0000-4000-8000-000000000104','91600000-0000-4000-8000-000000000001','Archived title','Private archived body','2026-10-07T17:00:00.000001Z');
SELECT is((SELECT status FROM private.product_feedback_reports WHERE id='91600000-0000-4000-8000-000000000103'),'open','original inserts inherit open');
SELECT is((SELECT revision FROM private.product_feedback_reports WHERE id='91600000-0000-4000-8000-000000000103'),0::bigint,'revision zero default');
SELECT ok((SELECT archived_at IS NULL AND updated_at IS NOT NULL FROM private.product_feedback_reports WHERE id='91600000-0000-4000-8000-000000000103'),'archive/update defaults');
UPDATE private.product_feedback_reports SET status='resolved' WHERE id IN ('91600000-0000-4000-8000-000000000101','91600000-0000-4000-8000-000000000104');
UPDATE private.product_feedback_reports SET archived_at=now() WHERE id='91600000-0000-4000-8000-000000000104';
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','inbox',null,'',25,null,null)->'items'),2,'inbox only open unarchived');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','resolved',null,'',25,null,null)->'items'),1,'resolved only unarchived');
SELECT is(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','archive','resolved','',25,null,null)->'items'->0->>'id','91600000-0000-4000-8000-000000000104','archived resolved stays resolved');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',25,null,null)->'items'),4,'all archive states');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,E'%_\\',25,null,null)->'items'),1,'wildcard/escape search is literal');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'LITERAL',25,null,null)->'items'),1,'case insensitive title search');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'Private synthetic body',25,null,null)->'items'),0,'private body not searched');
SELECT is(jsonb_array_length(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',1,null,null)->'items'),2,'bounded limit plus one');
SELECT is(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',1,null,null)->'items'->0->>'id','91600000-0000-4000-8000-000000000104','tied time descending id');
SELECT is(public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',2,'2026-10-07T17:00:00.000001Z','91600000-0000-4000-8000-000000000103')->'items'->0->>'id','91600000-0000-4000-8000-000000000102','strict tuple next page');
SELECT ok(NOT (public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',1,null,null)->'items'->0 ?| ARRAY['body','actor_id','email','payload_hash']),'list excludes body/identity/key');
SELECT is(public.get_product_feedback_staff('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000103')->>'body','Private synthetic body','authorized detail body');
SELECT is(public.get_product_feedback_staff('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000103')->'capabilities'->>'canManage','false','no management grant');
SELECT is(public.get_product_feedback_staff('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000199'),null::jsonb,'eligible missing detail null');
SELECT throws_ok($$SELECT public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','inbox','open','',25,null,null)$$,'22023','Invalid feedback query','incompatible status rejected');
SELECT throws_ok($$SELECT public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',51,null,null)$$,'22023','Invalid feedback query','SQL limit enforced');
SELECT throws_ok($$SELECT public.list_product_feedback_staff('91600000-0000-4000-8000-000000000001','all',null,'',25,now(),null)$$,'22023','Invalid feedback query','partial cursor rejected');
ALTER TABLE private.infrastructure_employees RENAME TO staff_inbox_test_registry_unavailable;
SELECT throws_ok($$SELECT public.get_product_feedback_staff('91600000-0000-4000-8000-000000000001','91600000-0000-4000-8000-000000000103')$$,'PT503','Feedback unavailable','missing canonical registry never domain fallback');
ALTER TABLE private.staff_inbox_test_registry_unavailable RENAME TO infrastructure_employees;
SELECT * FROM finish();
ROLLBACK;
-- Future causal SQL gate, NOT executed: remove active/ban/marker/email conjuncts,
-- service role guard, literal escaping or tuple id; require targeted TAP RED,
-- restore exact migration bytes and strict TAP GREEN under the admitted executor.
