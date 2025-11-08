--
-- Fix add_ws_creator() function to remove role column reference
--
-- This migration updates the add_ws_creator() trigger function that was
-- still referencing the removed 'role' column from workspace_members table.
-- The role column was removed in migration 20251104101455_migrate_legacy_roles_to_role_permissions.sql
--

set check_function_bodies = off;

-- Drop obsolete sync_member_roles_from_invite function (trigger already dropped in previous migration)
DROP FUNCTION IF EXISTS public.sync_member_roles_from_invite();

-- Update add_ws_creator to remove role column reference
CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Insert workspace creator as a member (role column removed)
    INSERT INTO public.workspace_members(ws_id, user_id)
    VALUES (new.id, auth.uid());
  END IF;
  RETURN new;
END;
$function$;
