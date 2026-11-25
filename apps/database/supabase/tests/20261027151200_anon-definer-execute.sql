BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
CREATE TEMP TABLE anon_definer_allowlist (signature text PRIMARY KEY);
INSERT INTO anon_definer_allowlist VALUES
  ('public.is_org_member(uuid,uuid)'),
  ('public.has_workspace_permission(uuid,uuid,text)'),
  ('public.check_request()'),
  ('public.validate_cross_app_token_with_session(text,text)');
CREATE FUNCTION pg_temp.anon_definer_violations() RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE fn record; failures text[] := '{}';
BEGIN
  FOR fn IN
    SELECT p.oid, p.proacl, p.proowner FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM anon_definer_allowlist a
        WHERE to_regprocedure(a.signature)::oid = p.oid)
  LOOP
    IF has_function_privilege('anon', fn.oid, 'EXECUTE') OR EXISTS (
      SELECT 1 FROM aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      failures := array_append(failures, fn.oid::regprocedure::text);
    END IF;
  END LOOP;
  RETURN failures;
END;
$$;

-- These assertions run before reapplication so the same test is RED on main.
SELECT is(cardinality(pg_temp.anon_definer_violations()), 0,
  'catalog loop: no non-allowlisted definer allows anon or PUBLIC');
SELECT ok(to_regprocedure(signature) IS NOT NULL
  AND has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'),
  'anon retains allowlisted ' || signature)
FROM anon_definer_allowlist ORDER BY signature;
SELECT ok(count(*) > 0 AND bool_and(
  NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  p.proname || ': all overloads are service_role-only')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('record_email_bounce', 'record_email_complaint')
GROUP BY p.proname ORDER BY p.proname;
SELECT is((SELECT count(DISTINCT p.proname)::integer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('record_email_bounce', 'record_email_complaint')), 2,
  'both provider-ingestion functions exist');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.get_workspace_overview()', '42501',
  'permission denied for function get_workspace_overview', 'anon cannot call workspace overview');
SELECT throws_ok('SELECT public.get_recent_audit_logs(1)', '42501',
  'permission denied for function get_recent_audit_logs', 'anon cannot call audit logs');
SELECT lives_ok('SELECT * FROM public.guest_users_lead_generation LIMIT 1',
  'anon SELECT on an existing RLS-helper table still prepares and runs');
SELECT lives_ok($$SELECT public.validate_cross_app_token_with_session('sb19-invalid-token', 'web')$$,
  'anonymous token validation still returns a normal invalid-token result');
SELECT set_config('request.method', 'GET', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT lives_ok('SELECT public.check_account_request()',
  'signed-out PostgREST pre-request hook still runs');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
CREATE FUNCTION public.sb19_default_probe() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$SELECT 1$$;
SELECT ok(NOT has_function_privilege('anon', 'public.sb19_default_probe()', 'EXECUTE'),
  'new functions do not default to anon EXECUTE');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p,
  LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = 'public.sb19_default_probe()'::regprocedure AND a.grantee = 0
    AND a.privilege_type = 'EXECUTE'), 'new functions do not default to PUBLIC EXECUTE');
SELECT ok(has_function_privilege('authenticated', 'public.sb19_default_probe()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.sb19_default_probe()', 'EXECUTE'),
  'new functions preserve signed-in and service defaults previously supplied by PUBLIC');

CREATE TABLE public.sb19_policy_probe (ws_id uuid);
INSERT INTO public.sb19_policy_probe VALUES ('00000000-0000-0000-0000-000000000000');
ALTER TABLE public.sb19_policy_probe ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sb19_policy_probe TO anon;
CREATE POLICY sb19_policy_probe ON public.sb19_policy_probe FOR SELECT TO anon
  USING (public.is_org_member(auth.uid(), ws_id)
    OR public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions'));
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.sb19_policy_probe), 0,
  'row-bearing anonymous policy evaluation returns zero rows without a privilege error');
RESET ROLE;
CREATE FUNCTION pg_temp.sb19_signed_in_default_probe() RETURNS integer
LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $$SELECT 1$$;
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.sb19_signed_in_default_probe(), 1,
  'signed-in callers retain the old global default on temporary invoker helpers');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(pg_temp.sb19_signed_in_default_probe(), 1,
  'service callers retain the old global default on temporary invoker helpers');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
