-- Workspace ownership (creator_id) and personal status are protected columns.
--
-- * Table-level UPDATE stays granted to authenticated so settings updates
--   (name, handle, avatar, ...) and future columns keep working without
--   per-column grants.
-- * A BEFORE UPDATE trigger rejects API-role (anon/authenticated) changes to
--   creator_id unless they run inside transfer_workspace_ownership(), and
--   allows personal changes only by the workspace's current creator.
-- * Service-role and migration contexts are unaffected.

GRANT UPDATE ON public.workspaces TO authenticated;

CREATE TABLE IF NOT EXISTS public.workspace_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  previous_creator_id uuid,
  new_creator_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_ownership_transfers_ws_id_idx
ON public.workspace_ownership_transfers (ws_id, created_at DESC);

ALTER TABLE public.workspace_ownership_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workspace_ownership_transfers
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.workspace_ownership_transfers TO service_role;

COMMENT ON TABLE public.workspace_ownership_transfers IS
  'Audit log of workspace ownership transfers made through transfer_workspace_ownership().';

-- SECURITY INVOKER on purpose: current_user must reflect the role that issued
-- the UPDATE, so definer-owned paths are distinguishable from API roles.
CREATE OR REPLACE FUNCTION public.guard_workspace_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_api_caller boolean :=
    current_user IN ('anon', 'authenticated')
    OR coalesce(auth.role(), '') IN ('anon', 'authenticated');
BEGIN
  IF NOT v_api_caller THEN
    RETURN NEW;
  END IF;

  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id
    AND (
      current_user IN ('anon', 'authenticated')
      OR coalesce(
        current_setting('tuturuuu.workspace_ownership_transfer', true),
        ''
      ) IS DISTINCT FROM OLD.id::text
    )
  THEN
    RAISE EXCEPTION 'Workspace ownership can only change through an ownership transfer'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.personal IS DISTINCT FROM OLD.personal
    AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.creator_id)
  THEN
    RAISE EXCEPTION 'Only the workspace creator can change personal status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_workspace_protected_columns()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspaces_guard_protected_columns
ON public.workspaces;

CREATE TRIGGER workspaces_guard_protected_columns
BEFORE UPDATE OF creator_id, personal ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.guard_workspace_protected_columns();

-- Transfers ownership of a team workspace from its current creator to an
-- existing member and records an audit row.
CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(
  p_ws_id uuid,
  p_new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_ws_id IS NULL OR p_new_owner_id IS NULL THEN
    RAISE EXCEPTION 'Workspace and new owner are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT w.id, w.creator_id, w.personal
  INTO v_workspace
  FROM public.workspaces w
  WHERE w.id = p_ws_id
    AND w.deleted IS NOT TRUE
  FOR UPDATE;

  IF NOT FOUND OR v_workspace.creator_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Only the workspace creator can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  IF p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR v_workspace.personal IS TRUE
  THEN
    RAISE EXCEPTION 'This workspace cannot be transferred'
      USING ERRCODE = '22023';
  END IF;

  IF p_new_owner_id = v_actor THEN
    RAISE EXCEPTION 'New owner must differ from the current owner'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.ws_id = p_ws_id
      AND m.user_id = p_new_owner_id
      AND m.type = 'MEMBER'::public.workspace_member_type
  ) THEN
    RAISE EXCEPTION 'New owner must be a workspace member'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config(
    'tuturuuu.workspace_ownership_transfer',
    p_ws_id::text,
    true
  );

  UPDATE public.workspaces
  SET creator_id = p_new_owner_id
  WHERE id = p_ws_id;

  PERFORM set_config('tuturuuu.workspace_ownership_transfer', '', true);

  INSERT INTO public.workspace_ownership_transfers (
    ws_id,
    previous_creator_id,
    new_creator_id,
    actor_id
  )
  VALUES (p_ws_id, v_workspace.creator_id, p_new_owner_id, v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_workspace_ownership(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(uuid, uuid)
TO authenticated, service_role;

COMMENT ON FUNCTION public.transfer_workspace_ownership(uuid, uuid) IS
  'Lets the current creator transfer a team workspace to an existing MEMBER and records the transfer in workspace_ownership_transfers.';
