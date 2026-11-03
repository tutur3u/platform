-- NEEDS MASTERMIND APPROVAL + Security review. Adds the manage_mastermind
-- workspace permission with NO default grants.
--
-- Product rule (apps/docs/platform/architecture/workspaces-permissions.mdx):
-- manage_mastermind is held only through an explicit, audited role grant in
-- the root workspace. Workspace creators, admin grants and default
-- permissions never imply it, and the API roles (anon, authenticated,
-- service_role) cannot enable it or add members to a role that holds it.
-- The only grant path for API sessions is private.grant_mastermind_access(),
-- executable by the database owner alone. It creates one dedicated root role,
-- records its id in private.mastermind_access_role and only ever uses that
-- id: role names are not unique and role managers can set them. The role
-- holds only manage_mastermind, has at most one member, and API sessions
-- cannot rename, edit or delete it. This migration grants it to nobody.
--
-- The single role the grant RPC created, recorded by id.
CREATE TABLE IF NOT EXISTS private.mastermind_access_role (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  role_id uuid NOT NULL UNIQUE
    REFERENCES public.workspace_roles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.mastermind_access_role ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.mastermind_access_role
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.mastermind_access_role IS
  'Id of the one root role private.grant_mastermind_access created. The only role that may hold manage_mastermind.';

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
-- tuturuuu: no-grant (internal)
CREATE OR REPLACE FUNCTION private.mastermind_grant_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT session_user::text NOT IN (
      'authenticator', 'anon', 'authenticated', 'service_role'
    )
    AND pg_has_role(session_user, 'postgres', 'MEMBER')
    AND coalesce(
      current_setting('tuturuuu.mastermind_grant', true),
      ''
    ) = 'audited';
$$;

-- tuturuuu: no-grant (internal)
CREATE OR REPLACE FUNCTION private.guard_mastermind_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_dedicated boolean;
BEGIN
  v_dedicated := EXISTS (
    SELECT 1 FROM private.mastermind_access_role mar
    WHERE mar.role_id = NEW.role_id
  );

  -- The dedicated role holds manage_mastermind and nothing else, enabled or
  -- not, whoever writes.
  IF v_dedicated AND NEW.permission::text <> 'manage_mastermind' THEN
    RAISE EXCEPTION 'the Mastermind access role holds only manage_mastermind'
      USING ERRCODE = '42501';
  END IF;

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

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.workspace_role_permissions wrp
    WHERE wrp.ws_id = NEW.ws_id
      AND wrp.role_id = NEW.role_id
      AND wrp.permission = NEW.permission
      AND wrp.enabled
  ) THEN
    -- BEFORE INSERT runs before ON CONFLICT resolves the existing grant.
    RETURN NEW;
  END IF;

  IF NEW.ws_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'manage_mastermind can only be granted in the root workspace'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_dedicated THEN
    RAISE EXCEPTION 'manage_mastermind is granted only on the role recorded by private.grant_mastermind_access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.mastermind_grant_allowed() THEN
    RAISE EXCEPTION 'manage_mastermind is granted only through private.grant_mastermind_access'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (internal)
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

-- tuturuuu: no-grant (internal)
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

  IF (
    EXISTS (
      SELECT 1 FROM private.mastermind_access_role mar
      WHERE mar.role_id = NEW.role_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_role_permissions wrp
      WHERE wrp.role_id = NEW.role_id
        AND wrp.permission::text = 'manage_mastermind'
        AND wrp.enabled = true
    )
  ) AND NOT private.mastermind_grant_allowed() THEN
    RAISE EXCEPTION 'members of a manage_mastermind role are added only through private.grant_mastermind_access'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- The dedicated role cannot be renamed, re-dated, moved or deleted outside
-- the grant RPC; revoke membership with private.revoke_mastermind_access.
-- tuturuuu: no-grant (internal)
CREATE OR REPLACE FUNCTION private.guard_mastermind_access_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.mastermind_access_role mar
    WHERE mar.role_id = OLD.id
  ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'the Mastermind access role cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF NEW IS DISTINCT FROM OLD AND NOT private.mastermind_grant_allowed() THEN
    RAISE EXCEPTION 'the Mastermind access role is changed only through private.grant_mastermind_access'
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
REVOKE ALL ON FUNCTION private.guard_mastermind_access_role()
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

DROP TRIGGER IF EXISTS guard_mastermind_access_role
  ON public.workspace_roles;
CREATE TRIGGER guard_mastermind_access_role
  BEFORE UPDATE OR DELETE ON public.workspace_roles
  FOR EACH ROW EXECUTE FUNCTION private.guard_mastermind_access_role();

-- Idempotent, audited grant. Run by an operator as the database owner after an
-- explicit production GO; see the feature page for the snippet. Uses only the
-- recorded role (created on first use) and refuses when it has another member
-- or any permission row besides manage_mastermind.
-- tuturuuu: no-grant (internal)
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
  IF NOT pg_has_role(session_user, 'postgres', 'MEMBER') THEN
    RAISE EXCEPTION 'grant_mastermind_access: database owner session required'
      USING ERRCODE = '42501';
  END IF;
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
      AND wm.type = 'MEMBER'::public.workspace_member_type
  ) THEN
    RAISE EXCEPTION 'grant_mastermind_access: user is not a root workspace member';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'grant_mastermind_access: user must exist in auth.users';
  END IF;

  PERFORM set_config('tuturuuu.mastermind_grant', 'audited', true);

  -- Serialise concurrent grants so the role is created once.
  PERFORM pg_advisory_xact_lock(hashtext('tuturuuu.mastermind_grant'));

  -- By recorded id only, never by name.
  SELECT mar.role_id INTO v_role_id
  FROM private.mastermind_access_role mar;

  IF v_role_id IS NULL THEN
    INSERT INTO public.workspace_roles (ws_id, name)
    VALUES (v_root, 'Mastermind')
    RETURNING id INTO v_role_id;
    INSERT INTO private.mastermind_access_role (role_id)
    VALUES (v_role_id);
    v_changed := true;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.workspace_roles wr
    WHERE wr.id = v_role_id
      AND wr.ws_id = v_root
  ) THEN
    RAISE EXCEPTION 'grant_mastermind_access: the recorded Mastermind role is not a root workspace role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_role_members wrm
    WHERE wrm.role_id = v_role_id
      AND wrm.user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'grant_mastermind_access: the Mastermind role has another member';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = v_role_id
      AND (wrp.permission::text <> 'manage_mastermind' OR wrp.ws_id <> v_root)
  ) THEN
    RAISE EXCEPTION 'grant_mastermind_access: the Mastermind role holds a permission other than manage_mastermind';
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

-- tuturuuu: no-grant (internal)
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
  v_role_id uuid;
  v_rows integer;
BEGIN
  IF NOT pg_has_role(session_user, 'postgres', 'MEMBER') THEN
    RAISE EXCEPTION 'revoke_mastermind_access: database owner session required'
      USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_mastermind_access: user id is required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'revoke_mastermind_access: a reason is required';
  END IF;

  -- Any root membership type: revoking also clears an inert GUEST row.
  SELECT mar.role_id INTO v_role_id
  FROM private.mastermind_access_role mar;

  DELETE FROM public.workspace_role_members wrm
  WHERE wrm.role_id = v_role_id
    AND wrm.user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO private.mastermind_access_audit
    (action, target_user_id, role_id, changed, reason)
  VALUES ('revoke', p_user_id, v_role_id, v_rows > 0, btrim(p_reason));

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION private.grant_mastermind_access(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.revoke_mastermind_access(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.grant_mastermind_access(uuid, text) IS
  'Idempotent, audited manage_mastermind grant on the recorded root Mastermind role (one member, one permission). Database owner only; production use needs an explicit GO.';
COMMENT ON FUNCTION private.revoke_mastermind_access(uuid, text) IS
  'Audited removal of a user from the recorded Mastermind role. Database owner only.';
