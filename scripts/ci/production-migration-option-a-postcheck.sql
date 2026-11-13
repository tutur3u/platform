-- D38 Option A post-apply checks (Selene, Security Desk, 2026-11-14).
-- READ ONLY. Every check RAISEs an exception on failure (the psql exit code must be non-zero with ON_ERROR_STOP=1).
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f d38-postcheck.sql
-- Source: tutur3u/platform 321e5e2d migrations 20261111120000..120310 and 20261112133000; SR-924 fence 20261109223000.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

DO $chk$
DECLARE
  expected_versions text[] := ARRAY[
    '20261111120000','20261111120100','20261111120200','20261111120201',
    '20261111120202','20261111120203','20261111120204','20261111120205',
    '20261111120206','20261111120207','20261111120208','20261111120310',
    '20261112133000'];
  expected_indexes text[] := ARRAY[
    'meet_ai_chunks_account_session_idx','meet_ai_chunks_timeline_idx',
    'meet_ai_chunks_legacy_sequence_key','meet_ai_chunks_stream_sequence_key'];
  expected_constraints text[] := ARRAY[
    'meet_ai_chunks_account_id_fkey','meet_ai_chunks_provenance_check','meet_ai_chunks_stream_fkey',
    'meet_ai_sessions_billing_host_id_fkey','meet_ai_sessions_billing_ws_id_fkey',
    'meet_ai_sessions_capture_state_check','meet_ai_sessions_cost_check',
    'meet_ai_sessions_counters_check','meet_ai_sessions_legacy_check',
    'meet_ai_sessions_protocol_check','meet_ai_sessions_self_v1_check',
    'meet_ai_sessions_user_id_fkey'];
  retention_fns text[] := ARRAY[
    'private.ai_studio_metadata_cutoff(integer, timestamptz)',
    'private.count_ai_studio_retention()',
    'private.cleanup_ai_studio_retention_batch(integer)'];
  n int;
  bad text;
  r record;
  invite_oid oid;
BEGIN
  -- 1. Ledger: all 13 present.
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations
   WHERE version = ANY(expected_versions);
  IF n <> 13 THEN
    SELECT string_agg(v, ',') INTO bad FROM unnest(expected_versions) v
     WHERE v NOT IN (SELECT version FROM supabase_migrations.schema_migrations);
    RAISE EXCEPTION 'D38-1 ledger: % of 13 present; missing %', n, bad;
  END IF;

  -- 2. The 4 concurrent indexes exist and are valid and ready.
  SELECT string_agg(i, ',') INTO bad FROM unnest(expected_indexes) i
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
       JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'public' AND c.relname = i AND x.indisvalid AND x.indisready);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-2 index missing/invalid: %', bad; END IF;

  -- 3. The 12 meet_ai constraints exist and are validated.
  SELECT string_agg(k, ',') INTO bad FROM unnest(expected_constraints) k
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace s ON s.oid = t.relnamespace
      WHERE s.nspname = 'public' AND t.relname IN ('meet_ai_sessions','meet_ai_chunks')
        AND c.conname = k AND c.convalidated);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-3 constraint missing/not validated: %', bad; END IF;

  -- 4. SR-924 fence: direct EXECUTE grants on private.* functions to PUBLIC/anon/authenticated/authenticator.
  --    Allowed: authenticated -> can_join_form_realtime_topic(text,uuid), can_join_task_realtime_topic(text,uuid),
  --    valid_subscription_months(date[]); authenticator -> get_rate_limit_trust_decision(uuid,inet,uuid). Nothing else.
  SELECT string_agg(format('%s->%s', g.grantee_name, p.oid::regprocedure), '; ') INTO bad
    FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace AND s.nspname = 'private'
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    CROSS JOIN LATERAL (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                    ELSE (SELECT rolname FROM pg_roles WHERE oid = a.grantee) END AS grantee_name) g
   WHERE a.privilege_type = 'EXECUTE'
     AND g.grantee_name IN ('PUBLIC','anon','authenticated','authenticator')
     AND NOT (
       (g.grantee_name = 'authenticated' AND p.oid::regprocedure::text IN (
          'private.can_join_form_realtime_topic(text,uuid)',
          'private.can_join_task_realtime_topic(text,uuid)',
          'private.valid_subscription_months(date[])'))
       OR (g.grantee_name = 'authenticator' AND p.oid::regprocedure::text =
          'private.get_rate_limit_trust_decision(uuid,inet,uuid)'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-4 SR-924 fence drift: %', bad; END IF;

  -- 5. IEEAI invite RPC: SECURITY DEFINER, pinned search_path, EXECUTE only service_role (+ owner).
  invite_oid := to_regprocedure('private.accept_ieeai_free_workspace_invite(text,uuid,uuid,uuid[])');
  IF invite_oid IS NULL THEN RAISE EXCEPTION 'D38-5 invite RPC missing'; END IF;
  SELECT p.prosecdef, p.proconfig INTO r FROM pg_proc p WHERE p.oid = invite_oid;
  IF NOT r.prosecdef THEN RAISE EXCEPTION 'D38-5 invite RPC not SECURITY DEFINER'; END IF;
  IF r.proconfig IS NULL OR NOT ('search_path=pg_catalog, pg_temp' = ANY(r.proconfig)) THEN
    RAISE EXCEPTION 'D38-5 invite RPC search_path not pinned: %', r.proconfig; END IF;
  SELECT string_agg(coalesce(ro.rolname, 'PUBLIC'), ',') INTO bad
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    LEFT JOIN pg_roles ro ON ro.oid = a.grantee
   WHERE p.oid = invite_oid AND a.privilege_type = 'EXECUTE'
     AND a.grantee <> p.proowner AND coalesce(ro.rolname, 'PUBLIC') <> 'service_role';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-5 invite RPC extra EXECUTE: %', bad; END IF;

  -- 5b. Acceptances table: RLS enabled AND forced, no grants to anyone but the owner.
  SELECT c.relrowsecurity, c.relforcerowsecurity, c.oid, c.relowner INTO r
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'private' AND c.relname = 'ieeai_invite_acceptances';
  IF r.oid IS NULL THEN RAISE EXCEPTION 'D38-5b acceptances table missing'; END IF;
  IF NOT (r.relrowsecurity AND r.relforcerowsecurity) THEN
    RAISE EXCEPTION 'D38-5b acceptances RLS enabled=% forced=%', r.relrowsecurity, r.relforcerowsecurity; END IF;
  SELECT string_agg(DISTINCT coalesce(ro.rolname, 'PUBLIC') || ':' || a.privilege_type, ',') INTO bad
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    LEFT JOIN pg_roles ro ON ro.oid = a.grantee
   WHERE c.oid = r.oid AND a.grantee <> c.relowner;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-5b acceptances has grants: %', bad; END IF;

  -- 6. Retention functions: SECURITY INVOKER, pinned search_path, EXECUTE only service_role (+ owner).
  FOR r IN SELECT f, to_regprocedure(f) AS oid FROM unnest(retention_fns) f LOOP
    IF r.oid IS NULL THEN RAISE EXCEPTION 'D38-6 retention fn missing: %', r.f; END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = r.oid) THEN
      RAISE EXCEPTION 'D38-6 retention fn is SECURITY DEFINER: %', r.f; END IF;
    IF NOT coalesce((SELECT 'search_path=pg_catalog, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = r.oid), false) THEN
      RAISE EXCEPTION 'D38-6 retention fn search_path not pinned: %', r.f; END IF;
    SELECT string_agg(coalesce(ro.rolname, 'PUBLIC'), ',') INTO bad
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_roles ro ON ro.oid = a.grantee
     WHERE p.oid = r.oid AND a.privilege_type = 'EXECUTE'
       AND a.grantee <> p.proowner AND coalesce(ro.rolname, 'PUBLIC') <> 'service_role';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-6 retention fn % extra EXECUTE: %', r.f, bad; END IF;
  END LOOP;
  -- record_ai_studio_retention_run: same rules, signature resolved by name (single overload expected).
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'private' AND p.proname = 'record_ai_studio_retention_run';
  IF n <> 1 THEN RAISE EXCEPTION 'D38-6 record_ai_studio_retention_run overloads: %', n; END IF;
  SELECT string_agg(coalesce(ro.rolname, 'PUBLIC'), ',') INTO bad
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    LEFT JOIN pg_roles ro ON ro.oid = a.grantee
   WHERE s.nspname = 'private' AND p.proname = 'record_ai_studio_retention_run'
     AND (p.prosecdef OR a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
          AND coalesce(ro.rolname, 'PUBLIC') <> 'service_role');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-6 record_ai_studio_retention_run definer or extra EXECUTE: %', bad; END IF;

  -- 6b. Retention runs table: RLS on; only service_role SELECT/INSERT besides the owner.
  SELECT string_agg(DISTINCT coalesce(ro.rolname, 'PUBLIC') || ':' || a.privilege_type, ',') INTO bad
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    LEFT JOIN pg_roles ro ON ro.oid = a.grantee
   WHERE s.nspname = 'private' AND c.relname = 'ai_studio_retention_runs' AND a.grantee <> c.relowner
     AND NOT (coalesce(ro.rolname, 'PUBLIC') = 'service_role' AND a.privilege_type IN ('SELECT','INSERT'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'D38-6b retention runs extra grants: %', bad; END IF;
  IF NOT coalesce((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
                    WHERE s.nspname = 'private' AND c.relname = 'ai_studio_retention_runs'), false) THEN
    RAISE EXCEPTION 'D38-6b retention runs RLS not enabled'; END IF;

  RAISE NOTICE 'D38 POSTCHECK PASS: ledger 13, indexes 4 valid, constraints 12 validated, SR-924 fence intact, invite RPC/table locked, retention service_role-only invoker';
END
$chk$;

ROLLBACK;
-- Not checkable in SQL here (external, still required): realtime/rate-limit/IEEAI invite runtime smokes; ai-studio-retention Cron Control job stays dry_run.
