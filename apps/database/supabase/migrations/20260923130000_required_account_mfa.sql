-- Fenced metadata transitions: stale recovery completion cannot clear a newer
-- recovery marker after an application coordination lease expires.
CREATE OR REPLACE FUNCTION public.transition_account_mfa_policy(
  p_user_id uuid, p_expected jsonb, p_next jsonb, p_clear_devices boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE metadata jsonb; current_policy jsonb; next_policy jsonb; boundary bigint;
BEGIN
  SELECT raw_app_meta_data INTO metadata FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002'; END IF;
  metadata := COALESCE(metadata, '{}'::jsonb);
  current_policy := metadata -> 'tuturuuu_required_mfa';
  IF COALESCE(current_policy, 'null'::jsonb) IS DISTINCT FROM COALESCE(p_expected, 'null'::jsonb) THEN
    RAISE EXCEPTION 'Account security changed concurrently' USING ERRCODE = '40001';
  END IF;
  IF p_next IS NULL OR p_next = 'null'::jsonb THEN
    metadata := metadata - 'tuturuuu_required_mfa';
  ELSE
    IF jsonb_typeof(p_next) <> 'object' OR jsonb_typeof(p_next -> 'required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid account security policy' USING ERRCODE = '22023';
    END IF;
    boundary := floor(extract(epoch FROM clock_timestamp()));
    next_policy := p_next || jsonb_build_object('generation', gen_random_uuid()::text, 'verifiedAfter', boundary);
    IF next_policy ? 'primaryVerifiedAfter' THEN
      next_policy := next_policy || jsonb_build_object('primaryVerifiedAfter', boundary);
    END IF;
    metadata := metadata || jsonb_build_object('tuturuuu_required_mfa', next_policy);
  END IF;
  IF p_clear_devices THEN
    metadata := metadata || '{"tuturuuu_device_authenticators":{"version":1,"locked":false,"devices":[]}}'::jsonb;
  END IF;
  UPDATE auth.users SET raw_app_meta_data = metadata, updated_at = clock_timestamp() WHERE id = p_user_id;
  RETURN next_policy;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_account_mfa_policy(uuid,jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_account_mfa_policy(uuid,jsonb,jsonb,boolean) TO service_role;

-- Resolve provider session lineage without exposing the Auth schema to clients.
CREATE OR REPLACE FUNCTION public.account_mfa_verified_factor(
  p_user_id uuid, p_session_id text, p_verified_at bigint,
  p_primary_verified_at bigint DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE policy jsonb; factor uuid; boundary numeric;
BEGIN
  IF NOT pg_input_is_valid(p_session_id, 'uuid') OR p_verified_at < 0
    OR p_verified_at > extract(epoch FROM statement_timestamp()) THEN RETURN NULL; END IF;
  SELECT raw_app_meta_data -> 'tuturuuu_required_mfa' INTO policy FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF policy IS NOT NULL AND policy -> 'required' IS DISTINCT FROM 'false'::jsonb THEN
    IF jsonb_typeof(policy) IS DISTINCT FROM 'object' OR policy -> 'required' IS DISTINCT FROM 'true'::jsonb
      OR (policy ? 'recoveryInProgress' AND policy -> 'recoveryInProgress' IS DISTINCT FROM 'false'::jsonb)
      OR jsonb_typeof(policy -> 'verifiedAfter') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
    boundary := (policy ->> 'verifiedAfter')::numeric;
    IF boundary < 0 OR boundary <> trunc(boundary) OR p_verified_at <= boundary THEN RETURN NULL; END IF;
    IF policy ? 'primaryVerifiedAfter' THEN
      IF jsonb_typeof(policy -> 'primaryVerifiedAfter') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
      boundary := (policy ->> 'primaryVerifiedAfter')::numeric;
      IF boundary < 0 OR boundary <> trunc(boundary) OR p_primary_verified_at IS NULL
        OR p_primary_verified_at <= boundary OR p_primary_verified_at > extract(epoch FROM statement_timestamp()) THEN RETURN NULL; END IF;
    END IF;
  END IF;
  SELECT f.id INTO factor FROM auth.sessions s JOIN auth.mfa_factors f ON f.id = s.factor_id
  WHERE s.id = p_session_id::uuid AND s.user_id = p_user_id AND f.user_id = p_user_id
    AND s.aal = 'aal2' AND f.status = 'verified'
    AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
    AND floor(extract(epoch FROM f.created_at)) <= p_verified_at;
  RETURN factor;
END;
$$;
REVOKE ALL ON FUNCTION public.account_mfa_verified_factor(uuid, text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_mfa_verified_factor(uuid, text, bigint, bigint) TO service_role;

-- Server-owned per-account MFA policy. UI controls must remain unavailable until
-- this enforcement capability and the application assurance gates are deployed.
CREATE OR REPLACE FUNCTION public.account_required_mfa_satisfied()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  claims jsonb := auth.jwt();
  metadata jsonb;
  policy jsonb;
  boundary numeric;
  proof_time numeric;
  primary_time bigint;
  primary_boundary numeric;
  entry jsonb;
BEGIN
  -- This adds an opt-in MFA constraint; existing identity/RLS checks remain.
  IF actor IS NULL THEN RETURN auth.role() IS DISTINCT FROM 'authenticated'; END IF;
  SELECT raw_app_meta_data INTO metadata FROM auth.users WHERE id = actor;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT COALESCE(metadata ? 'tuturuuu_required_mfa', false) THEN
    RETURN true;
  END IF;
  policy := metadata -> 'tuturuuu_required_mfa';
  IF jsonb_typeof(policy) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF policy -> 'required' = 'false'::jsonb THEN RETURN true; END IF;
  IF (policy ? 'recoveryInProgress' AND policy -> 'recoveryInProgress' IS DISTINCT FROM 'false'::jsonb) THEN RETURN false; END IF;
  IF policy -> 'required' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(policy -> 'verifiedAfter') IS DISTINCT FROM 'number'
  THEN RETURN false; END IF;
  boundary := (policy ->> 'verifiedAfter')::numeric;
  IF boundary < 0 OR boundary <> trunc(boundary)
    OR boundary > 9007199254740991 THEN RETURN false; END IF;
  IF jsonb_typeof(claims -> 'amr') = 'array' THEN
    SELECT max((v ->> 'timestamp')::bigint) INTO primary_time FROM jsonb_array_elements(claims -> 'amr') v
    WHERE v ->> 'method' IN ('password','otp','oauth','sso/saml','sso','magiclink','recovery','invite','passkey','web3','email/signup','phone/signup')
      AND jsonb_typeof(v -> 'timestamp') = 'number' AND pg_input_is_valid(v ->> 'timestamp', 'bigint');
  END IF;
  IF policy ? 'primaryVerifiedAfter' THEN
    IF jsonb_typeof(policy -> 'primaryVerifiedAfter') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    primary_boundary := (policy ->> 'primaryVerifiedAfter')::numeric;
    IF primary_boundary < 0 OR primary_boundary <> trunc(primary_boundary)
      OR primary_boundary > 9007199254740991 OR primary_time IS NULL
      OR primary_time <= primary_boundary
      OR primary_time > extract(epoch FROM statement_timestamp()) THEN RETURN false; END IF;
  END IF;
  -- A consumed mobile approval is equivalent only for the exact authenticated
  -- browser session it approved, and only after the latest recovery boundary.
  IF COALESCE(claims ->> 'session_id', '') <> '' AND EXISTS (
    SELECT 1 FROM public.qr_login_challenges q
    WHERE q.approver_user_id = actor AND q.status = 'consumed'
      AND q.request_metadata ->> 'kind' = 'mfa_mobile_approval'
      AND q.request_metadata ->> 'requesterSessionId' = claims ->> 'session_id'
      AND q.approval_metadata ->> 'approverSessionId' = claims ->> 'session_id'
      AND floor(extract(epoch FROM q.approved_at)) > boundary
      AND q.approved_at <= statement_timestamp()
      AND q.consumed_at IS NOT NULL
      AND pg_input_is_valid(q.approval_metadata #>> '{requiredMfaProof,verifiedAt}', 'bigint')
      AND public.account_mfa_verified_factor(actor,
        q.approval_metadata #>> '{requiredMfaProof,sessionId}',
        CASE WHEN pg_input_is_valid(q.approval_metadata #>> '{requiredMfaProof,verifiedAt}', 'bigint') THEN (q.approval_metadata #>> '{requiredMfaProof,verifiedAt}')::bigint END,
        CASE WHEN pg_input_is_valid(q.approval_metadata #>> '{requiredMfaProof,primaryVerifiedAt}', 'bigint') THEN (q.approval_metadata #>> '{requiredMfaProof,primaryVerifiedAt}')::bigint END
      )::text = q.approval_metadata #>> '{requiredMfaProof,factorId}'
      AND CASE WHEN pg_input_is_valid(q.approval_metadata ->> 'mobileMfaValidUntil', 'timestamptz')
        THEN (q.approval_metadata ->> 'mobileMfaValidUntil')::timestamptz
        ELSE NULL END > statement_timestamp()
  ) THEN RETURN true; END IF;
  IF claims ->> 'aal' IS DISTINCT FROM 'aal2'
    OR COALESCE(claims ->> 'session_id', '') = ''
    OR jsonb_typeof(claims -> 'amr') IS DISTINCT FROM 'array'
  THEN RETURN false; END IF;
  -- Refresh-token issuance time does not count as a second-factor check.
  FOR entry IN SELECT value FROM jsonb_array_elements(claims -> 'amr') LOOP
    IF entry ->> 'method' IN ('totp', 'mfa/phone', 'mfa/webauthn', 'mfa/recovery_code')
      AND jsonb_typeof(entry -> 'timestamp') = 'number' THEN
      proof_time := (entry ->> 'timestamp')::numeric;
      IF proof_time = trunc(proof_time) AND proof_time > boundary
        AND proof_time <= extract(epoch FROM statement_timestamp())
        AND public.account_mfa_verified_factor(actor, claims ->> 'session_id', proof_time::bigint, primary_time) IS NOT NULL THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.account_required_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_required_mfa_satisfied() TO authenticated, service_role;

-- Preserve the existing abuse/rate-limit hook while protecting reads and
-- SECURITY DEFINER RPCs as well as writes. GoTrue enrollment remains accessible.
CREATE OR REPLACE FUNCTION public.check_account_request()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.account_required_mfa_satisfied() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MFA verification required';
  END IF;
  PERFORM public.check_request();
END;
$$;
REVOKE ALL ON FUNCTION public.check_account_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_account_request() TO authenticator, anon, authenticated, service_role;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.check_account_request';

-- PostgREST's hook does not run for Storage and Realtime. Add restrictive
-- policies to existing application tables without granting any new access.
DO $$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (n.nspname IN ('public', 'private')
      OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
      OR (n.nspname = 'realtime' AND c.relname = 'messages'))
      AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'CREATE POLICY account_required_mfa ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()))',
      target.nspname, target.relname
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS qr_login_required_mfa_session_idx
ON public.qr_login_challenges (approver_user_id, (approval_metadata ->> 'approverSessionId'), approved_at DESC)
WHERE status = 'consumed' AND request_metadata ->> 'kind' = 'mfa_mobile_approval';

-- Admin code checks this before offering/enabling policy controls.
CREATE OR REPLACE FUNCTION public.required_mfa_enforcement_version()
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT 1; $$;
REVOKE ALL ON FUNCTION public.required_mfa_enforcement_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.required_mfa_enforcement_version() TO service_role;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
