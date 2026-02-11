-- Enforce at most one personal workspace per user
--
-- The unique index `one_personal_workspace_per_creator` already prevents
-- duplicates, but its error message is cryptic. This migration adds:
--
-- 1. A BEFORE INSERT OR UPDATE trigger with a clear error message
-- 2. A fix to auto_create_personal_workspace() to handle soft-deleted
--    personal workspaces by reactivating them instead of inserting new ones

-- ============================================================
-- Part A: Trigger function — clear error on duplicate personal workspace
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_unique_personal_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Only check rows being set to personal = true
  IF NEW.personal IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Allow if no other personal workspace exists for this creator
  IF EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE creator_id = NEW.creator_id
      AND personal = true
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'User already has a personal workspace'
      USING ERRCODE = 'unique_violation',
            HINT = 'Each user may have at most one personal workspace.';
  END IF;

  RETURN NEW;
END;
$func$;

-- ============================================================
-- Part B: Attach trigger to workspaces table
-- ============================================================
DROP TRIGGER IF EXISTS enforce_unique_personal_workspace_tr ON public.workspaces;

CREATE TRIGGER enforce_unique_personal_workspace_tr
BEFORE INSERT OR UPDATE OF personal ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unique_personal_workspace();

-- ============================================================
-- Part C: Fix auto_create_personal_workspace() to reactivate
--         soft-deleted personal workspaces instead of inserting
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_personal_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  existing_ws_id uuid;
  new_ws_id uuid;
BEGIN
  -- Check for any existing personal workspace (including soft-deleted)
  SELECT id INTO existing_ws_id
  FROM public.workspaces
  WHERE creator_id = NEW.id AND personal = true
  LIMIT 1;

  IF existing_ws_id IS NOT NULL THEN
    -- Reactivate if soft-deleted, otherwise skip
    UPDATE public.workspaces
    SET deleted = false
    WHERE id = existing_ws_id AND deleted = true;

    -- Ensure membership exists
    INSERT INTO public.workspace_members (ws_id, user_id)
    VALUES (existing_ws_id, NEW.id)
    ON CONFLICT DO NOTHING;

    RETURN NEW;
  END IF;

  -- Create personal workspace
  INSERT INTO public.workspaces (name, personal, creator_id)
  VALUES ('PERSONAL', true, NEW.id)
  RETURNING id INTO new_ws_id;

  -- Add creator as workspace member
  INSERT INTO public.workspace_members (ws_id, user_id)
  VALUES (new_ws_id, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$func$;
