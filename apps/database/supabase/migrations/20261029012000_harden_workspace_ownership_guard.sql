-- Harden the workspace ownership guard (follow-up to 20261028152419).
--
-- 1. The guard no longer trusts every role that is not anon/authenticated.
--    anon and authenticated stay rejected unconditionally. Every other role
--    may change creator_id only when one of these holds:
--      a. no end-user identity is attached to the transaction (migrations,
--         cron and admin SQL: auth.uid() is NULL and the JWT role is neither
--         anon nor authenticated), or the statement runs as service_role;
--      b. transfer_workspace_ownership() set the transaction-local flag
--         tuturuuu.workspace_ownership_transfer to this workspace id (the RPC
--         clears it right after its UPDATE);
--      c. the change is the workspaces_creator_id_fkey ON UPDATE CASCADE
--         action: the old creator id no longer exists in public.users and the
--         new one does, which only a users.id change produces.
--    A SECURITY DEFINER function running under a user JWT is therefore
--    rejected unless it is the transfer RPC.
-- 2. Marking a workspace personal requires exactly one member for API roles
--    (the same rule the personal route applies). The count runs as the
--    invoking role: a creator who is a member can read every member row.
-- 3. Every creator_id change is audited, whatever issued it. Audit rows keep
--    the workspace id without a foreign key so they outlive the workspace.
-- 4. service_role cannot use the transfer RPC (it has no auth.uid()), so its
--    EXECUTE grant is revoked. Nothing in apps/ or packages/ calls the RPC.

ALTER TABLE public.workspace_ownership_transfers
DROP CONSTRAINT IF EXISTS workspace_ownership_transfers_ws_id_fkey;

ALTER TABLE public.workspace_ownership_transfers
ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE public.workspace_ownership_transfers
ADD COLUMN IF NOT EXISTS actor_role text,
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'direct';

COMMENT ON TABLE public.workspace_ownership_transfers IS
  'Audit log of every workspaces.creator_id change. ws_id has no foreign key so rows outlive the workspace. source is transfer_rpc for transfer_workspace_ownership() and direct for any other writer; actor_id is NULL when no end user was attached.';

-- Runs as the function owner so API-free writers (service role, definer
-- owners) do not need INSERT on the audit table.
CREATE OR REPLACE FUNCTION private.audit_workspace_creator_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.workspace_ownership_transfers (
    ws_id,
    previous_creator_id,
    new_creator_id,
    actor_id,
    actor_role,
    source
  )
  VALUES (
    NEW.id,
    OLD.creator_id,
    NEW.creator_id,
    auth.uid(),
    coalesce(nullif(auth.role(), ''), 'database'),
    CASE
      WHEN current_setting('tuturuuu.workspace_ownership_transfer', true)
        IS NOT DISTINCT FROM NEW.id::text
      THEN 'transfer_rpc'
      ELSE 'direct'
    END
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_workspace_creator_change()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspaces_audit_creator_change
ON public.workspaces;

CREATE TRIGGER workspaces_audit_creator_change
AFTER UPDATE OF creator_id ON public.workspaces
FOR EACH ROW
WHEN (OLD.creator_id IS DISTINCT FROM NEW.creator_id)
EXECUTE FUNCTION private.audit_workspace_creator_change();

-- SECURITY INVOKER on purpose: current_user must reflect the role that issued
-- the UPDATE, so definer-owned paths are distinguishable from API roles.
CREATE OR REPLACE FUNCTION public.guard_workspace_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN
      RAISE EXCEPTION 'Workspace ownership can only change through an ownership transfer'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.personal IS DISTINCT FROM OLD.personal THEN
      IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.creator_id THEN
        RAISE EXCEPTION 'Only the workspace creator can change personal status'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.personal IS TRUE
        AND (
          SELECT count(*)
          FROM public.workspace_members m
          WHERE m.ws_id = OLD.id
        ) <> 1
      THEN
        RAISE EXCEPTION 'A personal workspace must have exactly one member'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id
    AND current_user <> 'service_role'
    AND (
      auth.uid() IS NOT NULL
      OR coalesce(auth.role(), '') IN ('anon', 'authenticated')
    )
    AND current_setting('tuturuuu.workspace_ownership_transfer', true)
      IS DISTINCT FROM OLD.id::text
    AND NOT (
      NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.creator_id)
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.creator_id)
    )
  THEN
    RAISE EXCEPTION 'Workspace ownership can only change through an ownership transfer'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Same body as 20261028152419 except the explicit audit INSERT moved into
-- the audit trigger and the ownership flag is set around the UPDATE.
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_workspace_ownership(uuid, uuid)
FROM service_role;

COMMENT ON FUNCTION public.transfer_workspace_ownership(uuid, uuid) IS
  'Lets the current creator transfer a team workspace to an existing MEMBER. The creator_id audit trigger records the transfer in workspace_ownership_transfers.';
