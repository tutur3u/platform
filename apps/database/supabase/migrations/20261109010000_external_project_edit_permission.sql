-- CMS editor role: edit_external_projects lets a member save draft page
-- versions and preview them privately, without publishing. Role matrix:
-- editor = edit; publisher = edit + publish; manager = all. can_edit includes
-- can_publish (which includes can_manage), never the reverse. The helper is
-- caller-bound like the other external project helpers (20261030130000).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The new value is only read at run time (has_workspace_permission casts its
-- text argument), never inside this transaction.
ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'edit_external_projects';

CREATE FUNCTION public.can_edit_workspace_external_projects(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
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

  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.can_publish_workspace_external_projects(p_ws_id, p_user_id)
    OR public.has_workspace_permission(
      p_ws_id,
      p_user_id,
      'edit_external_projects'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_edit_workspace_external_projects(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_edit_workspace_external_projects(uuid,uuid) review=CMS-M1-DATA-caller-bound-like-SR-330
GRANT EXECUTE ON FUNCTION public.can_edit_workspace_external_projects(uuid, uuid) TO authenticated, service_role;

COMMIT;
