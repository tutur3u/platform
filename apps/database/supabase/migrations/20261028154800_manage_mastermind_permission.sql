-- NEEDS MASTERMIND APPROVAL + Security review. Adds the manage_mastermind
-- workspace permission with NO default grants.
--
-- Product rule (apps/docs/platform/features/mobile-mastermind.mdx):
-- manage_mastermind is held only through an explicit, audited role grant in
-- the root workspace. Workspace creators, admin grants and default
-- permissions never imply it, and the API roles (anon, authenticated,
-- service_role) cannot enable it or add members to a role that holds it.
-- The only grant path is private.grant_mastermind_access(), executable by
-- the database owner alone. This migration grants it to nobody.
--
-- The new enum value is referenced only as text below: Postgres refuses a
-- value added in the same transaction as an enum literal.

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_mastermind';

-- Starts from the newest prior definition
-- (20260516180000_typed_workspace_default_permissions.sql) with the search_path
-- set by 20261024025000_harden_owned_definer_search_paths.sql. Only the
-- manage_mastermind branch at the top is new.
CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Explicit-grant permission: root workspace role grants only. Creator,
  -- admin and default permissions never imply it.
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
  'Checks member workspace permissions. Priority: 0) manage_mastermind only via an explicit root-workspace role grant, 1) workspace creators, 2) MEMBER role/default admin except manage_subscription, 3) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

-- Append-only audit of every grant and revoke made through the private RPCs.
CREATE TABLE IF NOT EXISTS private.mastermind_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  target_user_id uuid NOT NULL,
  role_id uuid,
  changed boolean NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  performed_by text NOT NULL DEFAULT session_user,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.mastermind_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.mastermind_access_audit
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.mastermind_access_audit IS
  'Append-only audit of manage_mastermind grants and revokes. Written only by private.grant_mastermind_access / private.revoke_mastermind_access.';

-- Guards run as SECURITY DEFINER so role lookups see every row whatever the
-- caller's RLS; the caller is identified by session_user, which a definer
-- context does not change.
--
-- Grant fence: enabling manage_mastermind, or adding a member to a role that
-- holds it, needs the transaction-local flag that only the private grant RPC
-- sets, on a direct database-owner session. API sessions (PostgREST logs in
-- as authenticator, whatever role the JWT selects) never pass. Disabling and
-- deleting stay open.
CREATE OR REPLACE FUNCTION private.mastermind_grant_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT session_user::text NOT IN (
      'authenticator', 'anon', 'authenticated', 'service_role'
    )
    AND coalesce(
      current_setting('tuturuuu.mastermind_grant', true),
      ''
    ) = 'audited';
$$;

CREATE OR REPLACE FUNCTION private.guard_mastermind_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.permission::text <> 'manage_mastermind' OR NOT NEW.enabled THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.enabled
    AND OLD.permission = NEW.permission
    AND OLD.role_id = NEW.role_id
    AND OLD.ws_id = NEW.ws_id THEN
    -- Re-saving an unchanged grant (role editor upsert) is not a new grant.
    RETURN NEW;
  END IF;

  IF NEW.ws_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'manage_mastermind can only be granted in the root workspace'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.mastermind_grant_allowed() THEN
    RAISE EXCEPTION 'manage_mastermind is granted only through private.grant_mastermind_access'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_mastermind_default_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.permission::text = 'manage_mastermind' AND NEW.enabled THEN
    RAISE EXCEPTION 'manage_mastermind cannot be a default permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_mastermind_role_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.role_id = NEW.role_id
    AND OLD.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = NEW.role_id
      AND wrp.permission::text = 'manage_mastermind'
      AND wrp.enabled = true
  ) AND NOT private.mastermind_grant_allowed() THEN
    RAISE EXCEPTION 'members of a manage_mastermind role are added only through private.grant_mastermind_access'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.mastermind_grant_allowed()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_mastermind_role_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_mastermind_default_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_mastermind_role_member()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_mastermind_role_permission
  ON public.workspace_role_permissions;
CREATE TRIGGER guard_mastermind_role_permission
  BEFORE INSERT OR UPDATE ON public.workspace_role_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_mastermind_role_permission();

DROP TRIGGER IF EXISTS guard_mastermind_default_permission
  ON public.workspace_default_permissions;
CREATE TRIGGER guard_mastermind_default_permission
  BEFORE INSERT OR UPDATE ON public.workspace_default_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_mastermind_default_permission();

DROP TRIGGER IF EXISTS guard_mastermind_role_member
  ON public.workspace_role_members;
CREATE TRIGGER guard_mastermind_role_member
  BEFORE INSERT OR UPDATE ON public.workspace_role_members
  FOR EACH ROW EXECUTE FUNCTION private.guard_mastermind_role_member();

-- Idempotent, audited grant. Run by an operator as the database owner after an
-- explicit production GO; see the feature page for the snippet.
CREATE OR REPLACE FUNCTION private.grant_mastermind_access(
  p_user_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_root constant uuid := '00000000-0000-0000-0000-000000000000';
  v_role_id uuid;
  v_changed boolean := false;
  v_rows integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_mastermind_access: user id is required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'grant_mastermind_access: a reason is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.ws_id = v_root
      AND wm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'grant_mastermind_access: user is not a root workspace member';
  END IF;

  PERFORM set_config('tuturuuu.mastermind_grant', 'audited', true);

  -- Serialise concurrent grants so the role is created once.
  PERFORM pg_advisory_xact_lock(hashtext('tuturuuu.mastermind_grant'));

  SELECT wr.id INTO v_role_id
  FROM public.workspace_roles wr
  WHERE wr.ws_id = v_root
    AND wr.name = 'Mastermind'
  ORDER BY wr.created_at, wr.id
  LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.workspace_roles (ws_id, name)
    VALUES (v_root, 'Mastermind')
    RETURNING id INTO v_role_id;
    v_changed := true;
  END IF;

  INSERT INTO public.workspace_role_permissions (ws_id, role_id, permission, enabled)
  VALUES (v_root, v_role_id, 'manage_mastermind', true)
  ON CONFLICT (ws_id, permission, role_id) DO UPDATE
  SET enabled = true
  WHERE NOT public.workspace_role_permissions.enabled;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_changed := v_changed OR v_rows > 0;

  INSERT INTO public.workspace_role_members (role_id, user_id)
  VALUES (v_role_id, p_user_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_changed := v_changed OR v_rows > 0;

  INSERT INTO private.mastermind_access_audit
    (action, target_user_id, role_id, changed, reason)
  VALUES ('grant', p_user_id, v_role_id, v_changed, btrim(p_reason));

  PERFORM set_config('tuturuuu.mastermind_grant', '', true);
  RETURN v_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.revoke_mastermind_access(
  p_user_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_mastermind_access: user id is required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'revoke_mastermind_access: a reason is required';
  END IF;

  DELETE FROM public.workspace_role_members wrm
  USING public.workspace_role_permissions wrp
  WHERE wrp.role_id = wrm.role_id
    AND wrp.ws_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND wrp.permission::text = 'manage_mastermind'
    AND wrp.enabled = true
    AND wrm.user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO private.mastermind_access_audit
    (action, target_user_id, role_id, changed, reason)
  VALUES ('revoke', p_user_id, NULL, v_rows > 0, btrim(p_reason));

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION private.grant_mastermind_access(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.revoke_mastermind_access(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.grant_mastermind_access(uuid, text) IS
  'Idempotent, audited manage_mastermind grant in the root workspace. Database owner only; production use needs an explicit GO.';
COMMENT ON FUNCTION private.revoke_mastermind_access(uuid, text) IS
  'Audited removal of a user from every manage_mastermind role. Database owner only.';
