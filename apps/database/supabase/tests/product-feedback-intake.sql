-- UNEXECUTED packet. Run only after root admits an isolated disposable DB gate.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(53);
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid =
  'private.product_feedback_reports'::regclass), 'reports enable RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid =
  'private.product_feedback_receipts'::regclass), 'receipts enable RLS');
SELECT ok(NOT has_table_privilege('authenticated',
  'private.product_feedback_reports', 'SELECT'), 'actor cannot read content');
SELECT ok(NOT has_table_privilege('anon',
  'private.product_feedback_reports', 'SELECT'), 'anonymous cannot read content');
SELECT ok(has_column_privilege('authenticated',
  'private.product_feedback_receipts', 'id', 'SELECT'), 'actor can read receipt id');
SELECT ok(NOT has_column_privilege('authenticated',
  'private.product_feedback_receipts', 'payload_hash', 'SELECT'), 'hash is private');
SELECT ok(NOT has_column_privilege('authenticated',
  'private.product_feedback_receipts', 'actor_id', 'SELECT'), 'receipt actor column is private');
SELECT ok(NOT has_table_privilege('authenticated',
  'private.product_feedback_reports', 'INSERT'), 'actor cannot insert content');
SELECT ok(NOT has_table_privilege('authenticated',
  'private.product_feedback_receipts', 'INSERT'), 'actor cannot insert receipt');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.submit_product_feedback(uuid,uuid,text,text)', 'EXECUTE'), 'actor cannot invoke service transaction');
SELECT ok(NOT has_function_privilege('anon',
  'public.submit_product_feedback(uuid,uuid,text,text)', 'EXECUTE'), 'anonymous cannot invoke transaction');
SELECT ok(has_function_privilege('service_role',
  'public.submit_product_feedback(uuid,uuid,text,text)', 'EXECUTE'), 'service may invoke transaction');

-- Only disposable synthetic quota namespace touched; the whole test rolls back.
DELETE FROM private.security_budget_counters WHERE key LIKE 'api-cost:v1:product-feedback:%';
INSERT INTO auth.users(id,email) VALUES
  ('90500000-0000-4000-8000-000000000001','feedback-owner@example.test'),
  ('90500000-0000-4000-8000-000000000002','feedback-other@example.test');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE feedback_fixture AS SELECT public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000001',
  '90500000-0000-4000-8000-000000000101','Subject','Details') AS result;
SELECT is((SELECT result->>'status' FROM feedback_fixture), 'accepted', 'service intake accepted');
SELECT is((SELECT count(*)::int FROM private.product_feedback_reports
  WHERE actor_id = '90500000-0000-4000-8000-000000000001'),1,'one durable content row');
SELECT is((SELECT count(*)::int FROM private.product_feedback_receipts
  WHERE actor_id = '90500000-0000-4000-8000-000000000001'),1,'one durable receipt');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters
  WHERE key LIKE 'api-cost:v1:product-feedback:%'),3,'all three budgets charged');
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000001',
  '90500000-0000-4000-8000-000000000101','Subject','Details'),
  (SELECT result FROM feedback_fixture),'same payload replay gives exact stored receipt');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters
  WHERE key LIKE 'api-cost:v1:product-feedback:%'),3,'uncertain retry has no new charge');
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000001',
  '90500000-0000-4000-8000-000000000101','Changed','Details')->>'status',
  'conflict','changed payload conflicts');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters
  WHERE key LIKE 'api-cost:v1:product-feedback:%'),3,'conflict cannot charge');
DO $$ BEGIN
  FOR n IN 102..105 LOOP
    PERFORM public.submit_product_feedback('90500000-0000-4000-8000-000000000001',
      ('90500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Subject','Details');
  END LOOP;
END $$;
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000001',
  '90500000-0000-4000-8000-000000000106','Subject','Details')->>'status',
  'limited','sixth actor submission is limited');
SELECT is((SELECT sum(used)::int FROM private.security_budget_counters
  WHERE key LIKE 'api-cost:v1:product-feedback:%'),15,'rejected submission never partially charges');
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000002',
  '90500000-0000-4000-8000-000000000101','Subject','Details')->>'status',
  'accepted','same key in different actor scope is independent');
UPDATE private.security_budget_counters SET used = 20
  WHERE key LIKE 'api-cost:v1:product-feedback:network:%';
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000002',
  '90500000-0000-4000-8000-000000000102','Subject','Details')->>'status',
  'limited','network cap rejects');
SELECT is((SELECT used::int FROM private.security_budget_counters WHERE key LIKE
  'api-cost:v1:product-feedback:actor:90500000-0000-4000-8000-000000000002:%'),1,
  'network rejection does not charge actor');
UPDATE private.security_budget_counters SET used = 6
  WHERE key LIKE 'api-cost:v1:product-feedback:network:%';
UPDATE private.security_budget_counters SET used = 1000
  WHERE key LIKE 'api-cost:v1:product-feedback:global:%';
SELECT is(public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000002',
  '90500000-0000-4000-8000-000000000102','Subject','Details')->>'status',
  'limited','global cap rejects');
UPDATE private.security_budget_counters SET used = 6
  WHERE key LIKE 'api-cost:v1:product-feedback:global:%';
CREATE FUNCTION private.synthetic_feedback_failure() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.title = 'force rollback' THEN RAISE EXCEPTION 'Synthetic insert failure'; END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER synthetic_feedback_failure BEFORE INSERT ON private.product_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION private.synthetic_feedback_failure();
SELECT throws_ok($$SELECT public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000002',
  '90500000-0000-4000-8000-000000000102','force rollback','Details')$$,
  'P0001','Synthetic insert failure','insert exception aborts whole transaction');
SELECT is((SELECT used::int FROM private.security_budget_counters WHERE key LIKE
  'api-cost:v1:product-feedback:actor:90500000-0000-4000-8000-000000000002:%'),1,
  'failed insert rolls back reserved charge');
UPDATE feedback_fixture SET result = public.submit_product_feedback(
  '90500000-0000-4000-8000-000000000002',
  '90500000-0000-4000-8000-000000000101','Subject','Details');
-- Third actor with enough receipts to exercise the page cap and the keyset
-- cursor; every row shares one created_at, so id breaks the ties.
INSERT INTO auth.users(id,email) VALUES
  ('90500000-0000-4000-8000-000000000003','feedback-many@example.test');
WITH inserted AS (
  INSERT INTO private.product_feedback_reports(actor_id, title, body)
  SELECT '90500000-0000-4000-8000-000000000003', 'Bulk ' || n, 'Details'
  FROM generate_series(1, 55) AS n
  RETURNING id, actor_id, created_at
)
INSERT INTO private.product_feedback_receipts(id, actor_id, idempotency_key, payload_hash, created_at)
SELECT id, actor_id, gen_random_uuid(), repeat('0', 64), created_at FROM inserted;
CREATE TEMP TABLE feedback_actor_a_receipts AS
  SELECT id::text AS id FROM private.product_feedback_receipts
  WHERE actor_id = '90500000-0000-4000-8000-000000000001';
CREATE TEMP TABLE feedback_actor_b_receipts AS
  SELECT id::text AS id FROM private.product_feedback_receipts
  WHERE actor_id = '90500000-0000-4000-8000-000000000002';
GRANT SELECT ON feedback_actor_a_receipts, feedback_actor_b_receipts TO authenticated;
GRANT SELECT ON feedback_fixture TO authenticated;
-- Test-only access to exercise RLS directly; ROLLBACK removes this schema grant.
GRANT USAGE ON SCHEMA private TO authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"90500000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_product_feedback_receipt(
  '90500000-0000-4000-8000-000000000101')->>'id',
  (SELECT result->'receipt'->>'id' FROM feedback_fixture),
  'owner cannot get another actor receipt through a same-key collision');
SELECT is((SELECT count(id)::int FROM private.product_feedback_receipts),1,
  'direct SELECT policy exposes only owning actor receipt');
SELECT throws_ok($$SELECT payload_hash FROM private.product_feedback_receipts$$,
  '42501',NULL,'owner cannot select internal hash');
SELECT is(public.get_product_feedback_receipt(
  '90500000-0000-4000-8000-000000000102'),NULL::jsonb,
  'another actor key returns no receipt');
SELECT ok(NOT has_function_privilege('anon',
  'public.get_product_feedback_receipt(uuid)', 'EXECUTE'), 'anonymous cannot read receipts');
SELECT throws_ok($$SELECT body FROM private.product_feedback_reports$$,
  '42501',NULL,'owner cannot read content');

-- Own-receipt listing: caller-bound, keyset paged, server-side limit clamp.
SELECT is(jsonb_array_length(public.list_product_feedback_receipts()->'items'),1,
  'owner list returns only the caller receipts');
SELECT is(public.list_product_feedback_receipts()->'items'->0->>'id',
  (SELECT result->'receipt'->>'id' FROM feedback_fixture),
  'owner list returns the caller receipt id');
SELECT is((SELECT array_agg(k ORDER BY k) FROM
  jsonb_object_keys(public.list_product_feedback_receipts()->'items'->0) AS k),
  ARRAY['createdAt','id','title'],'owner list projects only receipt fields');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(
  public.list_product_feedback_receipts()->'items') e
  WHERE e->>'id' IN (SELECT id FROM feedback_actor_a_receipts)),0,
  'user B cannot see user A receipts');
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"90500000-0000-4000-8000-000000000001"}', true);
SELECT is(jsonb_array_length(public.list_product_feedback_receipts()->'items'),5,
  'user A lists exactly their own receipts');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(
  public.list_product_feedback_receipts()->'items') e
  WHERE e->>'id' IN (SELECT id FROM feedback_actor_b_receipts)),0,
  'user A cannot see user B receipts');
SELECT set_config('request.jwt.claims','{"role":"authenticated"}', true);
SELECT is(public.list_product_feedback_receipts(),
  '{"items":[],"hasMore":false}'::jsonb,'a missing subject lists nothing');
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"90500000-0000-4000-8000-000000000003"}', true);
SELECT is(jsonb_array_length(public.list_product_feedback_receipts(1000)->'items'),50,
  'limit is clamped to 50');
SELECT is(jsonb_array_length(public.list_product_feedback_receipts()->'items'),20,
  'default limit is 20');
SELECT is(jsonb_array_length(public.list_product_feedback_receipts(NULL)->'items'),20,
  'null limit falls back to 20');
SELECT is(jsonb_array_length(public.list_product_feedback_receipts(0)->'items'),1,
  'limit below one is clamped to one');
SELECT is((public.list_product_feedback_receipts(1000)->>'hasMore')::boolean,true,
  'a full page reports more rows');
CREATE TEMP TABLE feedback_first_page AS
  SELECT public.list_product_feedback_receipts(50) AS page;
GRANT SELECT ON feedback_first_page TO authenticated;
CREATE TEMP TABLE feedback_second_page AS
  SELECT public.list_product_feedback_receipts(50,
    (page->'items'->49->>'createdAt')::timestamptz,
    (page->'items'->49->>'id')::uuid) AS page FROM feedback_first_page;
SELECT is((SELECT jsonb_array_length(page->'items') || ':' || (page->>'hasMore')
  FROM feedback_second_page),'5:false','keyset cursor returns the remaining rows');
SELECT is((SELECT count(DISTINCT e->>'id')::int FROM (
  SELECT jsonb_array_elements(page->'items') AS e FROM feedback_first_page
  UNION ALL
  SELECT jsonb_array_elements(page->'items') FROM feedback_second_page) pages),55,
  'pages are disjoint and cover every receipt');
SELECT is((SELECT array_agg(e->>'id' ORDER BY ord) = array_agg(e->>'id' ORDER BY e->>'id' DESC)
  FROM feedback_first_page,
  jsonb_array_elements(page->'items') WITH ORDINALITY AS t(e, ord)),true,
  'ties on created_at are ordered by id descending');
RESET ROLE;
SELECT ok(has_function_privilege('authenticated',
  'public.list_product_feedback_receipts(integer,timestamptz,uuid)','EXECUTE'),
  'signed-in users may list their receipts');
SELECT ok(NOT has_function_privilege('anon',
  'public.list_product_feedback_receipts(integer,timestamptz,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role',
  'public.list_product_feedback_receipts(integer,timestamptz,uuid)','EXECUTE'),
  'anonymous and service roles cannot execute the listing');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.list_product_feedback_receipts()$$,
  '42501',NULL,'anonymous listing is denied');
RESET ROLE;
SELECT has_index('private','product_feedback_receipts',
  'product_feedback_receipts_actor_created_idx',
  ARRAY['actor_id','created_at','id'],
  'receipt listing has its keyset index');
SELECT * FROM finish();
ROLLBACK;
