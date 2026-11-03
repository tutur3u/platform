\set ON_ERROR_STOP on
-- Meet AI self_v1 (#7309) verification bootstrap. DISPOSABLE Supabase PG17 ONLY
-- (a task-owned public.ecr.aws/supabase/postgres:17.x container, connected
-- with PGOPTIONS=-cverify.disposable=meet-self-v1; see meet-self-v1.sh).
-- Minimal parent schema: stand-in tables carry only the columns, keys and FK
-- actions the Meet lineage and the self_v1 suites touch. The permission and
-- MFA helpers below are copied verbatim from main (20261030113002 and
-- 20260923130000); the Meet lineage itself is replayed from the real
-- migration files by meet-self-v1.sh.
begin;
do $$
begin
  if current_setting('verify.disposable', true) is distinct from 'meet-self-v1'
     or to_regclass('public.workspaces') is not null
     or to_regclass('auth.users') is null then
    raise exception 'meet self_v1 bootstrap: fresh disposable Supabase PG17 database only';
  end if;
end
$$;
create extension if not exists pgtap with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create type public.workspace_member_type as enum ('MEMBER', 'GUEST');
create type public.workspace_role_permission as enum ('admin', 'manage_mastermind',
  'manage_subscription', 'manage_users');
create table public.users (id uuid primary key);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text,
  personal boolean not null default false,
  creator_id uuid references public.users(id)
);
create table public.workspace_members (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  type public.workspace_member_type not null default 'MEMBER',
  primary key (ws_id, user_id)
);
create table public.workspace_roles (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text
);
create table public.workspace_role_permissions (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  permission public.workspace_role_permission not null,
  enabled boolean not null default false
);
create table public.workspace_role_members (
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.workspace_default_permissions (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  permission public.workspace_role_permission not null,
  member_type public.workspace_member_type not null default 'MEMBER',
  enabled boolean not null default false
);
create table private.mastermind_access_role (role_id uuid primary key);
create table public.workspace_meetings (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  creator_id uuid references public.users(id) on update cascade,
  name text
);
create table public.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.workspace_meetings(id) on delete cascade
);
create table private.recording_transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.recording_sessions(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Main enables RLS on every parent table; stand-ins do too (no policies).
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.workspace_role_permissions enable row level security;
alter table public.workspace_role_members enable row level security;
alter table public.workspace_default_permissions enable row level security;
alter table public.workspace_meetings enable row level security;
alter table public.recording_sessions enable row level security;
alter table private.recording_transcripts enable row level security;
alter table private.mastermind_access_role enable row level security;

-- Verbatim from main 20261030113002_consolidate_workspace_permission.sql.
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

-- Verbatim from main 20260923130000_required_account_mfa.sql.
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
commit;
