-- Re-run the creator-membership repair under a new migration version.
--
-- Production had already recorded 20260728013902 before its backfill was
-- rewritten to avoid INSERT-only guards during conflict resolution. This
-- idempotent follow-up makes the corrected repair explicit on every remote
-- database, including environments where the earlier version already ran.

DROP TRIGGER IF EXISTS workspace_members_enforce_type_update
ON public.workspace_members;

UPDATE public.workspace_members member
SET type = 'MEMBER'::public.workspace_member_type
FROM public.workspaces workspace
WHERE workspace.id = member.ws_id
  AND workspace.creator_id = member.user_id
  AND member.type IS DISTINCT FROM
    'MEMBER'::public.workspace_member_type;

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

CREATE TRIGGER workspace_members_enforce_type_update
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_member_type_update();

COMMENT ON TRIGGER workspace_members_enforce_type_update
ON public.workspace_members IS
  'Protects workspace membership type changes after the idempotent creator-membership repair.';
