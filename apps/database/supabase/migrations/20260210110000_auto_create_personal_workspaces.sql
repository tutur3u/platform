-- Auto-create personal workspaces for all users
--
-- Part A: Trigger function that auto-creates a personal workspace on user signup
-- Part B: Trigger on public.users (fires after create_user_profile inserts the row)
-- Part C: Update can_create_workspace() to count-based limit (the old "no personal
--         workspace" fallback becomes always-FALSE after auto-creation)
-- Part D: Backfill personal workspaces for existing users who lack one

-- ============================================================
-- Part A: Trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_personal_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_ws_id uuid;
BEGIN
  -- Guard: skip if user already has a personal workspace
  IF EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE creator_id = NEW.id AND personal = true AND deleted = false
  ) THEN
    RETURN NEW;
  END IF;

  -- Create personal workspace
  INSERT INTO public.workspaces (name, personal, creator_id)
  VALUES ('PERSONAL', true, NEW.id)
  RETURNING id INTO new_ws_id;

  -- Explicitly add creator as workspace member.
  -- The add_ws_creator() trigger on workspaces won't insert because
  -- auth.uid() is NULL in this trigger context.
  INSERT INTO public.workspace_members (ws_id, user_id)
  VALUES (new_ws_id, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- Part B: Trigger on public.users
-- ============================================================
-- Fires after create_user_profile has inserted the public.users row,
-- ensuring the FK target for workspaces.creator_id exists.
CREATE TRIGGER auto_create_personal_workspace_tr
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_personal_workspace();

-- ============================================================
-- Part C: Update can_create_workspace() to count-based limit
-- ============================================================
-- Old logic: allow_workspace_creation OR no personal workspace
-- New logic: allow_workspace_creation OR workspace_count < 10
-- The limit matches MAX_WORKSPACES_FOR_FREE_USERS in packages/utils/src/constants.ts
CREATE OR REPLACE FUNCTION public.can_create_workspace(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.platform_user_roles pur
      WHERE pur.user_id = p_user_id
        AND pur.allow_workspace_creation = true
    )
  ) OR (
    (SELECT count(*)
     FROM public.workspaces
     WHERE creator_id = p_user_id AND deleted = false) < 10
  );
$function$;

-- ============================================================
-- Part D: Backfill existing users without a personal workspace
-- ============================================================
-- Single atomic CTE: find users missing personal workspaces,
-- create workspaces, then create memberships.
WITH users_without_personal AS (
  SELECT u.id AS user_id
  FROM public.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.creator_id = u.id AND w.personal = true AND w.deleted = false
  )
),
new_workspaces AS (
  INSERT INTO public.workspaces (name, personal, creator_id)
  SELECT 'PERSONAL', true, uwp.user_id
  FROM users_without_personal uwp
  ON CONFLICT DO NOTHING
  RETURNING id, creator_id
)
INSERT INTO public.workspace_members (ws_id, user_id)
SELECT nw.id, nw.creator_id
FROM new_workspaces nw
ON CONFLICT DO NOTHING;
