-- Guarantee that a workspace creator is also a workspace member.
--
-- `add_ws_creator()` derived the first member from `auth.uid()`, which is only
-- set when the insert runs on a user-scoped client. Satellite apps forward a
-- signed app-session cookie instead of Supabase auth cookies, so the team
-- workspace route falls back to the service-role client and `auth.uid()` is
-- NULL there. The workspace was created with a `creator_id` and no members at
-- all, and because permission resolution starts from membership, the creator
-- landed in their own new workspace with read-only access.
--
-- The trigger now falls back to the `creator_id` recorded on the row, which
-- covers every current and future service-role creation path rather than only
-- the one route that surfaced this.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  creator uuid := COALESCE(auth.uid(), new.creator_id);
BEGIN
  IF creator IS NOT NULL THEN
    INSERT INTO public.workspace_members(ws_id, user_id)
    VALUES (new.id, creator)
    ON CONFLICT (ws_id, user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

COMMENT ON FUNCTION public.add_ws_creator() IS
  'Adds the workspace creator as a member. Uses auth.uid() when the insert runs on a user-scoped client and falls back to workspaces.creator_id for service-role inserts (satellite app sessions).';

-- Safety net for the reverse orphan: a workspace whose recorded creator is not
-- a member, leaving whoever is inside unable to administer it. When the sole
-- member is someone else, hand them the workspace.
--
-- `workspaces.creator_id` is NOT NULL, so "missing creator" can only mean a
-- creator who is absent from the member list. Deliberately limited to a single
-- member: with two or more there is no non-arbitrary choice. This cannot demote
-- a present creator, because a creator who is a member fails the check, and
-- with the fix above a new workspace has its creator as the first member.
CREATE OR REPLACE FUNCTION public.claim_workspace_creator_when_missing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF new.type <> 'MEMBER'::public.workspace_member_type THEN
    RETURN new;
  END IF;

  UPDATE public.workspaces w
  SET creator_id = new.user_id
  WHERE w.id = new.ws_id
    AND w.creator_id <> new.user_id
    -- No other member exists, which also settles that the recorded creator is
    -- not one, since they are someone other than the row being inserted.
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_members m
      WHERE m.ws_id = new.ws_id
        AND m.user_id <> new.user_id
    );

  RETURN new;
END;
$function$;

COMMENT ON FUNCTION public.claim_workspace_creator_when_missing() IS
  'Assigns a workspace its sole member as creator when the recorded creator is not a member, so a workspace is never left without an administrator.';

DROP TRIGGER IF EXISTS claim_workspace_creator_when_missing_tr
  ON public.workspace_members;

CREATE TRIGGER claim_workspace_creator_when_missing_tr
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_workspace_creator_when_missing();

-- Heal workspaces already created without their creator as a member. Safe to
-- apply to every such row: the members API refuses to remove a creator
-- ("Workspace creator cannot be removed"), so a creator missing from the member
-- list is always an artifact of the bug above and never a deliberate removal.
INSERT INTO public.workspace_members (ws_id, user_id)
SELECT w.id, w.creator_id
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workspace_members m
  WHERE m.ws_id = w.id
    AND m.user_id = w.creator_id
)
ON CONFLICT (ws_id, user_id) DO NOTHING;
