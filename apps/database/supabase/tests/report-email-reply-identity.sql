BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Entirely disposable synthetic rows, rolled back at the end.
INSERT INTO public.users(id, display_name)
  VALUES ('92000000-0000-4000-8000-000000000001', 'Reply identity fixture');
INSERT INTO public.workspaces(id, name, creator_id, personal)
  VALUES ('92000000-0000-4000-8000-000000000002', 'Reply identity fixture',
    '92000000-0000-4000-8000-000000000001', false);
INSERT INTO public.workspace_users(id, ws_id, display_name, email)
  VALUES ('92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002', 'Synthetic recipient', 'reply@example.invalid');
INSERT INTO public.workspace_user_groups(id, ws_id, name)
  VALUES ('92000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000002', 'Synthetic group');
INSERT INTO private.external_user_monthly_reports
  (id, user_id, group_id, title, content, feedback, report_approval_status, approved_by, approved_at, updated_at)
  VALUES ('92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004', 'Synthetic report', 'Synthetic body', '', 'APPROVED', '92000000-0000-4000-8000-000000000001', now(), now());
INSERT INTO private.user_report_email_queue
  (id, report_id, ws_id, user_id, recipient_email, delivery_kind, status, locked_by, locked_at)
  VALUES ('92000000-0000-4000-8000-000000000006',
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000003', 'reply@example.invalid', 'test',
    'processing', 'fixture-worker', now());
UPDATE private.external_user_monthly_reports SET delivery_status = 'processing'
  WHERE id = '92000000-0000-4000-8000-000000000005';

CREATE FUNCTION pg_temp.reserve_identity(
  p_generation uuid DEFAULT gen_random_uuid(),
  p_worker text DEFAULT 'fixture-worker',
  p_revision bigint DEFAULT 1,
  p_recipient text DEFAULT 'reply@example.invalid',
  p_ws uuid DEFAULT '92000000-0000-4000-8000-000000000002',
  p_content text DEFAULT repeat('a', 64),
  p_kind text DEFAULT 'test'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT private.reserve_report_email_reply_identity(
    '92000000-0000-4000-8000-000000000006', p_ws,
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000003', p_worker, now(), p_recipient,
    p_revision, p_kind, p_generation,
    decode(replace(p_generation::text, '-', '') || replace(p_generation::text, '-', ''), 'hex'),
    decode(repeat('ab', 80), 'hex'), 1, 'reply.example.invalid', p_content)
$$;
CREATE FUNCTION pg_temp.transition_identity(
  p_outcome text, p_kind text DEFAULT 'test',
  p_worker text DEFAULT 'fixture-worker', p_provider text DEFAULT NULL,
  p_ws uuid DEFAULT '92000000-0000-4000-8000-000000000002'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT private.transition_report_email_reply_identity(id, p_ws, p_worker, now(), p_outcome, p_provider)
  FROM private.report_email_reply_identities WHERE delivery_kind = p_kind
$$;

SELECT ok(NOT private.report_email_reply_receiving_ready(), 'P1 never claims receiving readiness');
SELECT ok((SELECT relrowsecurity FROM pg_class
  WHERE oid = 'private.report_email_reply_identities'::regclass), 'Identity table enables RLS');
SELECT ok(NOT has_table_privilege('anon', 'private.report_email_reply_identities', 'SELECT'), 'Anon cannot read tokens');
SELECT ok(NOT has_table_privilege('authenticated', 'private.report_email_reply_identities', 'SELECT'), 'Members cannot read tokens directly');
SELECT ok(NOT has_table_privilege('service_role', 'private.report_email_reply_identities', 'UPDATE'), 'Service cannot bypass transition RPC');
SELECT ok(NOT has_table_privilege('service_role', 'private.report_email_reply_identities', 'INSERT'), 'Service cannot bypass reserve fences');
SELECT ok(NOT has_table_privilege('service_role', 'private.report_email_reply_identities', 'DELETE'), 'Service cannot erase durable history');
SELECT ok(has_table_privilege('service_role', 'private.report_email_reply_identities', 'SELECT'), 'Service reads private identities');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private' AND p.proname IN ('reserve_report_email_reply_identity',
    'transition_report_email_reply_identity', 'report_email_reply_receiving_ready')
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))), 'All RPCs deny client execution');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private' AND p.proname IN ('reserve_report_email_reply_identity',
    'transition_report_email_reply_identity', 'report_email_reply_receiving_ready')
  AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')), 'RPCs permit service execution');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_ws => '92000000-0000-4000-8000-000000000099')$$,
  '22023', 'Report email identity scope mismatch', 'Wrong tenant rejected before reservation');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_worker => 'other-worker')$$,
  '55000', 'Report email identity fence mismatch', 'Lease worker substitution denied');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_revision => 2)$$,
  '55000', 'Report email identity fence mismatch', 'Stale/replaced revision denied');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_recipient => 'other@example.invalid')$$,
  '55000', 'Report email identity fence mismatch', 'Recipient substitution denied');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_kind => 'send')$$,
  '55000', 'Report email identity fence mismatch', 'Test/live substitution denied');
UPDATE private.user_report_email_queue SET locked_at = now() - interval '16 minutes'
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT throws_ok($$SELECT pg_temp.reserve_identity()$$,
  '55000', 'Report email identity fence mismatch', 'Expired/different timestamp lease denied');
UPDATE private.user_report_email_queue SET locked_at = now()
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT throws_ok($$UPDATE private.external_user_monthly_reports SET delivery_status = 'blocked'
  WHERE id = '92000000-0000-4000-8000-000000000005';
UPDATE private.external_user_monthly_reports SET report_approval_status = 'PENDING', approved_by = NULL, approved_at = NULL
  WHERE id = '92000000-0000-4000-8000-000000000005';
SELECT pg_temp.reserve_identity()$$,
  '55000', 'Report email identity fence mismatch', 'Unapproved report cannot reserve identity');
SELECT is((pg_temp.reserve_identity('92000000-0000-4000-8000-000000000007')->>'id'),
  '92000000-0000-4000-8000-000000000007', 'Fresh generation reserves candidate identity');
SELECT is((pg_temp.reserve_identity('92000000-0000-4000-8000-000000000008')->>'id'),
  '92000000-0000-4000-8000-000000000007', 'Retry reuses original opaque identity, not candidate');
SELECT is((SELECT count(*) FROM private.report_email_reply_identities), 1::bigint, 'Retry does not allocate extra token');
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_content => repeat('b', 64))$$,
  '55000', 'Report email retry snapshot mismatch', 'Changed rendered payload cannot reuse generation');
SELECT throws_ok($$UPDATE private.report_email_reply_identities SET recipient_email = 'changed@example.invalid'$$,
  '55000', 'Report email identity is immutable', 'Identity fields immutable even for owner');
SELECT throws_ok($$DELETE FROM private.report_email_reply_identities$$,
  '55000', 'Report email identity history is immutable', 'History cannot be deleted');
SELECT throws_ok($$TRUNCATE private.report_email_reply_identities$$,
  '55000', 'Report email identity history is immutable', 'History cannot be truncated');
SELECT throws_ok($$SELECT pg_temp.transition_identity('accepted')$$,
  '55000', 'Report email submission lease mismatch', 'Acceptance requires previously submitted lease');
UPDATE public.workspace_users SET email = 'changed@example.invalid'
  WHERE id = '92000000-0000-4000-8000-000000000003';
SELECT throws_ok($$SELECT pg_temp.transition_identity('submitting')$$,
  '55000', 'Report email submission fence mismatch', 'Current recipient rechecked at submission');
UPDATE public.workspace_users SET email = 'reply@example.invalid'
  WHERE id = '92000000-0000-4000-8000-000000000003';
SELECT throws_ok($$UPDATE private.user_report_email_queue SET locked_by = 'replacement-worker'
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT pg_temp.transition_identity('submitting')$$,
  '55000', 'Report email submission fence mismatch', 'Lease replacement before provider invocation denied');
SELECT is(pg_temp.transition_identity('submitting')->>'outcome', 'submitting', 'Current lease may submit once');
SELECT throws_ok($$SELECT pg_temp.transition_identity('submitting')$$,
  '55000', 'Report email submission fence mismatch', 'Concurrent duplicate submit denied');
SELECT throws_ok($$SELECT pg_temp.reserve_identity()$$,
  '55000', 'Report email outcome forbids resending', 'In-flight send cannot be reserved twice');
SELECT is(pg_temp.transition_identity('rejected')->>'outcome', 'rejected', 'Definitive provider rejection permits safe retry');
SELECT is(pg_temp.reserve_identity()->>'id', '92000000-0000-4000-8000-000000000007', 'Definitive rejection retains same identity');
SELECT is(pg_temp.transition_identity('submitting')->>'outcome', 'submitting', 'Rejected send may submit same generation again');

-- The actual queue can lose its lease/reset its fields; historical outcome must
-- still be written by the submitting lease, and never erased by that reset.
UPDATE private.user_report_email_queue SET status = 'blocked', locked_by = NULL, locked_at = NULL
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT throws_ok($$SELECT pg_temp.transition_identity('accepted', p_worker => 'other-worker')$$,
  '55000', 'Report email submission lease mismatch', 'Different lease cannot forge acceptance');
SELECT is(pg_temp.transition_identity('outcome_unknown')->>'outcome', 'outcome_unknown', 'Original submitter persists uncertainty after lease loss');
SELECT throws_ok($$SELECT pg_temp.transition_identity('rejected')$$,
  '55000', 'Report email outcome transition forbidden', 'Unknown outcome cannot become safe rejection');
UPDATE private.user_report_email_queue SET status = 'processing', locked_by = 'fixture-worker', locked_at = now(),
  provider_message_id = NULL, last_error = NULL, sent_at = NULL
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT throws_ok($$SELECT pg_temp.reserve_identity()$$,
  '55000', 'Report email outcome forbids resending', 'Manual queue reset cannot clear uncertainty');
SELECT is(pg_temp.transition_identity('accepted', p_provider => 'synthetic-provider-message')->>'outcome',
  'accepted', 'Late definitive acceptance refines unknown outcome');
SELECT throws_ok($$SELECT pg_temp.transition_identity('accepted', p_provider => 'different-message')$$,
  '55000', 'Report email provider identity mismatch', 'Provider message identity cannot change');
SELECT is(pg_temp.transition_identity('application_sent')->>'outcome', 'application_sent', 'Application tracking distinguished from provider acceptance');
SELECT ok((SELECT provider_accepted_at IS NOT NULL AND application_sent_at IS NOT NULL
  FROM private.report_email_reply_identities WHERE delivery_kind = 'test'), 'Separate acceptance and tracking timestamps retained');
SELECT throws_ok($$SELECT pg_temp.reserve_identity()$$,
  '55000', 'Report email outcome forbids resending', 'Accepted/recorded test cannot implicitly resend');

-- Actual test -> live reuse of the queue makes a distinct immutable identity.
UPDATE private.user_report_email_queue SET delivery_kind = 'send'
  WHERE id = '92000000-0000-4000-8000-000000000006';
SELECT is(pg_temp.reserve_identity('92000000-0000-4000-8000-000000000009', p_kind => 'send')->>'id',
  '92000000-0000-4000-8000-000000000009', 'Test acceptance does not block first live send');
SELECT is((SELECT count(*) FROM private.report_email_reply_identities), 2::bigint, 'Test/live generations never merged');
SELECT is(pg_temp.transition_identity('submitting', p_kind => 'send')->>'outcome', 'submitting', 'Separate live identity submits');
SELECT is(pg_temp.transition_identity('accepted', p_kind => 'send', p_provider => 'synthetic-live-message')->>'outcome',
  'accepted', 'Live acceptance persists');
UPDATE private.external_user_monthly_reports SET delivery_status = 'blocked'
  WHERE id = '92000000-0000-4000-8000-000000000005';
UPDATE private.external_user_monthly_reports SET content = 'New synthetic revision'
  WHERE id = '92000000-0000-4000-8000-000000000005';
UPDATE private.external_user_monthly_reports SET delivery_status = 'processing'
  WHERE id = '92000000-0000-4000-8000-000000000005';
SELECT throws_ok($$SELECT pg_temp.reserve_identity(p_revision => 2, p_kind => 'send')$$,
  '55000', 'Report email outcome forbids resending', 'New revision cannot silently resend accepted live generation');
SELECT is((SELECT provider_message_id FROM private.report_email_reply_identities WHERE delivery_kind = 'send'),
  'synthetic-live-message', 'Queue/revision changes preserve provider evidence');

-- Replacing the mutable queue UUID must not evade historical report outcomes.
DELETE FROM private.user_report_email_queue
  WHERE id = '92000000-0000-4000-8000-000000000006';
INSERT INTO private.user_report_email_queue
  (id, report_id, ws_id, user_id, recipient_email, delivery_kind, status, locked_by, locked_at)
  VALUES ('92000000-0000-4000-8000-000000000016',
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000003', 'reply@example.invalid', 'send',
    'processing', 'fixture-worker', now());
SELECT throws_ok($$SELECT private.reserve_report_email_reply_identity(
    '92000000-0000-4000-8000-000000000016',
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000003', 'fixture-worker', now(),
    'reply@example.invalid', 2, 'send', gen_random_uuid(),
    decode(repeat('cc', 32), 'hex'), decode(repeat('cd', 76), 'hex'),
    1, 'reply.example.invalid', repeat('a', 64))$$,
  '55000', 'Report email outcome forbids resending', 'Replacement queue UUID cannot bypass accepted report history');

-- Actual service boundary, not just grants inspected as owner.
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE private.report_email_reply_identities SET outcome = 'reserved'$$,
  '42501', 'permission denied for table report_email_reply_identities', 'Service cannot reset accepted state');
RESET ROLE;
UPDATE private.external_user_monthly_reports SET delivery_status = 'blocked'
  WHERE id = '92000000-0000-4000-8000-000000000005';
DELETE FROM private.external_user_monthly_reports
  WHERE id = '92000000-0000-4000-8000-000000000005';
SELECT is((SELECT count(*) FROM private.report_email_reply_identities), 2::bigint,
  'Parent deletion cannot erase immutable provider history');
SELECT * FROM finish();
ROLLBACK;
