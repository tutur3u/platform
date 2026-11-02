-- Disposable PostgreSQL only. Minimal parent schema; real main permission and MFA functions.
CREATE EXTENSION IF NOT EXISTS pgtap;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb DEFAULT '{}');
CREATE TABLE auth.sessions(id uuid,user_id uuid,factor_id uuid,aal text,not_after timestamptz);
CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text,created_at timestamptz);
CREATE TYPE public.workspace_member_type AS ENUM ('MEMBER','GUEST');
CREATE TYPE public.workspace_role_permission AS ENUM ('manage_mastermind','admin','manage_subscription');
CREATE TABLE public.workspaces(id uuid PRIMARY KEY,creator_id uuid);
CREATE TABLE public.workspace_members(ws_id uuid,user_id uuid,type public.workspace_member_type);
CREATE TABLE public.workspace_roles(id uuid PRIMARY KEY,ws_id uuid);
CREATE TABLE public.workspace_role_members(role_id uuid,user_id uuid);
CREATE TABLE public.workspace_role_permissions(ws_id uuid,role_id uuid,permission public.workspace_role_permission,enabled boolean);
CREATE TABLE public.workspace_default_permissions(ws_id uuid,permission public.workspace_role_permission,member_type public.workspace_member_type,enabled boolean);
CREATE TABLE private.mastermind_access_role(role_id uuid);
CREATE TABLE public.workspace_users(id uuid PRIMARY KEY,ws_id uuid NOT NULL, UNIQUE(ws_id,id));
ALTER TABLE public.workspace_users ENABLE ROW LEVEL SECURITY;
-- End-user JWT roles evaluate their own identity outside triggers.
-- Service-role, database-owner and notification-trigger evaluation retain their
-- existing scope. Time-tracking actors ignore end-user override settings.
-- Trigger inventory (latest callers):
--   private.notify_time_tracking_request_submitted()
--   private.notify_time_tracking_request_status_change()
--   private.handle_report_approval()
--   private.handle_post_approval()
--   public.enforce_workspace_member_type_update()
--   private.check_time_tracking_request_update()
-- The first two evaluate notification recipients; the remaining callers use
-- the authenticated actor. Mastermind access requires the recorded root role.
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF pg_trigger_depth() = 0
    AND v_caller_role IN ('anon', 'authenticated')
    AND _user_id IS DISTINCT FROM v_caller_id
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members wsm
    WHERE wsm.ws_id = _org_id AND wsm.user_id = _user_id
      AND wsm.type = 'MEMBER'::public.workspace_member_type
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND p_user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

  -- Explicit-grant permission: only membership of the recorded root role.
  -- Creator, admin and default permissions never imply it.
  IF p_permission = 'manage_mastermind' THEN
    RETURN p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND public.is_org_member(p_user_id, p_ws_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr
          ON wr.id = wrm.role_id
         AND wr.ws_id = p_ws_id
        JOIN public.workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
         AND wrp.ws_id = p_ws_id
        JOIN private.mastermind_access_role mar
          ON mar.role_id = wrm.role_id
        WHERE wrm.user_id = p_user_id
          AND wrp.permission::text = 'manage_mastermind'
          AND wrp.enabled = true
      );
  END IF;

  -- Workspace creators keep full workspace access.
  IF EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = p_ws_id
      AND creator_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Default and role workspace permissions are member-only. Guests use the
  -- guest default evaluator in application code, plus workspace_guest_permissions
  -- for resource-scoped grants such as course access.
  IF NOT public.is_org_member(p_user_id, p_ws_id) THEN
    RETURN false;
  END IF;

  -- Admin grants all member permissions except manage_subscription.
  IF p_permission != 'manage_subscription' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks member workspace permissions. Priority: 0) manage_mastermind only via membership of the recorded root Mastermind role, 1) workspace creators, 2) MEMBER role/default admin except manage_subscription, 3) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.has_workspace_permission(uuid,uuid,text) anon-required review=https://github.com/tutur3u/platform/pull/7178
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, uuid, text) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.is_org_member(uuid,uuid) anon-required review=https://github.com/tutur3u/platform/pull/7178
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
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
