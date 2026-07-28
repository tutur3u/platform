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

-- The existing type-update trigger correctly rejects unauthenticated updates,
-- which also includes migration-role backfills because they have no JWT
-- claims. Suspend it while repairing stale GUEST creator rows, then recreate
-- it after installing the stronger creator-aware implementation below.
DROP TRIGGER IF EXISTS workspace_members_enforce_type_update
ON public.workspace_members;

-- Normalize existing creator rows without routing them through INSERT first.
-- PostgreSQL runs BEFORE INSERT triggers before ON CONFLICT resolution, so an
-- upsert here would trip the personal-workspace single-member guard even when
-- the creator row already exists and only needs its type repaired.
UPDATE public.workspace_members member
SET type = 'MEMBER'::public.workspace_member_type
FROM public.workspaces workspace
WHERE workspace.id = member.ws_id
  AND workspace.creator_id = member.user_id
  AND member.type IS DISTINCT FROM
    'MEMBER'::public.workspace_member_type;

-- Backfill only genuinely missing creator memberships. Keeping this separate
-- means the INSERT-only membership guards run solely for new rows.
INSERT INTO public.workspace_members (ws_id, user_id, type)
SELECT
  workspace.id,
  workspace.creator_id,
  'MEMBER'::public.workspace_member_type
FROM public.workspaces workspace
WHERE workspace.creator_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members member
    WHERE member.ws_id = workspace.id
      AND member.user_id = workspace.creator_id
  );

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

CREATE TRIGGER workspace_members_enforce_type_update
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_member_type_update();

COMMENT ON FUNCTION public.enforce_workspace_member_type_update() IS
  'Prevents the current workspace creator from being demoted and restricts other workspace_members.type changes to managers or service-role maintenance.';
