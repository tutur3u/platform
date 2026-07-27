-- Treat workspaces.creator_id as the authoritative workspace owner.
--
-- Runtime permission resolution now tolerates a missing or stale membership
-- row, but the database should still maintain the creator membership invariant
-- for downstream queries that enumerate workspace members.

-- Ownership must only change through an explicit workspaces.creator_id update.
-- The previous safety net reassigned an orphaned workspace to its first member,
-- which could silently replace the recorded creator.
DROP TRIGGER IF EXISTS claim_workspace_creator_when_missing_tr
ON public.workspace_members;

DROP FUNCTION IF EXISTS public.claim_workspace_creator_when_missing();

-- Repair existing creator memberships and normalize stale GUEST rows.
INSERT INTO public.workspace_members (ws_id, user_id, type)
SELECT
  w.id,
  w.creator_id,
  'MEMBER'::public.workspace_member_type
FROM public.workspaces w
WHERE w.creator_id IS NOT NULL
ON CONFLICT (ws_id, user_id) DO UPDATE
SET type = 'MEMBER'::public.workspace_member_type
WHERE workspace_members.type IS DISTINCT FROM
  'MEMBER'::public.workspace_member_type;

-- An explicit ownership transfer must make the new creator a full member,
-- whether their membership was missing or previously marked as GUEST.
CREATE OR REPLACE FUNCTION public.ensure_workspace_creator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.workspace_members (ws_id, user_id, type)
  VALUES (
    NEW.id,
    NEW.creator_id,
    'MEMBER'::public.workspace_member_type
  )
  ON CONFLICT (ws_id, user_id) DO UPDATE
  SET type = 'MEMBER'::public.workspace_member_type
  WHERE workspace_members.type IS DISTINCT FROM
    'MEMBER'::public.workspace_member_type;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_workspace_creator_membership()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspaces_ensure_creator_membership
ON public.workspaces;

CREATE TRIGGER workspaces_ensure_creator_membership
AFTER UPDATE OF creator_id ON public.workspaces
FOR EACH ROW
WHEN (NEW.creator_id IS DISTINCT FROM OLD.creator_id)
EXECUTE FUNCTION public.ensure_workspace_creator_membership();

COMMENT ON FUNCTION public.ensure_workspace_creator_membership() IS
  'Ensures an explicitly transferred workspace creator has a MEMBER membership row without implicitly changing workspace ownership.';

-- Keep the creator as a MEMBER while they remain the authoritative owner.
-- This check intentionally runs before the service-role maintenance bypass:
-- transfer workspaces.creator_id first, then update the former creator.
CREATE OR REPLACE FUNCTION public.enforce_workspace_member_type_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'MEMBER'::public.workspace_member_type
    AND EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = OLD.ws_id
        AND w.creator_id = OLD.user_id
    )
  THEN
    RAISE EXCEPTION 'Workspace creator must remain a MEMBER'
      USING ERRCODE = '42501';
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_workspace_permission(
    OLD.ws_id,
    auth.uid(),
    'manage_workspace_members'
  ) THEN
    RAISE EXCEPTION 'Only workspace managers can change workspace member type'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_workspace_member_type_update() IS
  'Prevents the current workspace creator from being demoted and restricts other workspace_members.type changes to managers or service-role maintenance.';
