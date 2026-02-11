-- Migration: consolidate_workspace_user_links
-- Purpose: Fix missing workspace_user_linked_users entries and improve the trigger
-- 
-- Problem:
-- The original trigger relies on email matching between workspace_users and user_private_details,
-- which can fail when emails are null, mismatched, or changed. This leaves workspace_members
-- without corresponding workspace_user_linked_users entries, breaking features that depend on
-- virtual_user_id lookups.
--
-- Solution:
-- 1. Backfill all missing links for existing workspace_members
-- 2. Rewrite the trigger to use direct ID assignment instead of email matching
-- 3. Add a consolidation RPC for on-demand repair

-- ============================================================================
-- STEP 1: Backfill missing workspace_user_linked_users entries
-- ============================================================================

-- Create workspace_users entries and links for all workspace_members
-- that don't have a corresponding linked_users entry
DO $$
DECLARE
  rec RECORD;
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
  created_count int := 0;
BEGIN
  FOR rec IN 
    SELECT wm.user_id, wm.ws_id
    FROM workspace_members wm
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_user_linked_users wul
      WHERE wul.platform_user_id = wm.user_id
        AND wul.ws_id = wm.ws_id
    )
  LOOP
    -- Get user details
    SELECT u.display_name, COALESCE(upd.email, '')
    INTO user_display_name, user_email
    FROM users u
    LEFT JOIN user_private_details upd ON upd.user_id = u.id
    WHERE u.id = rec.user_id;

    -- Skip if user doesn't exist (orphaned member record)
    IF user_display_name IS NULL THEN
      CONTINUE;
    END IF;

    -- Generate new workspace user ID
    new_workspace_user_id := gen_random_uuid();

    -- Create workspace_users entry
    INSERT INTO workspace_users (id, ws_id, display_name, email)
    VALUES (new_workspace_user_id, rec.ws_id, user_display_name, user_email);

    -- Create link using the ID we just generated (not email matching!)
    INSERT INTO workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
    VALUES (rec.user_id, new_workspace_user_id, rec.ws_id);

    created_count := created_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: created % missing workspace_user_linked_users entries', created_count;
END $$;

-- ============================================================================
-- STEP 2: Improved trigger function
-- ============================================================================

-- Drop the old trigger first
DROP TRIGGER IF EXISTS create_workspace_user_linked_user ON workspace_members;

-- Create improved trigger function that doesn't rely on email matching
CREATE OR REPLACE FUNCTION create_workspace_user_linked_user() 
RETURNS TRIGGER AS $$ 
DECLARE
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
BEGIN 
  -- Check if link already exists (idempotency)
  IF EXISTS (
    SELECT 1 FROM workspace_user_linked_users wul
    WHERE wul.platform_user_id = NEW.user_id 
      AND wul.ws_id = NEW.ws_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Get user details
  SELECT u.display_name, COALESCE(upd.email, '')
  INTO user_display_name, user_email
  FROM users u
  LEFT JOIN user_private_details upd ON upd.user_id = u.id
  WHERE u.id = NEW.user_id;

  -- If user doesn't exist, skip (shouldn't happen but defensive)
  IF user_display_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Generate new workspace user ID upfront
  new_workspace_user_id := gen_random_uuid();

  -- Create workspace_users entry
  INSERT INTO workspace_users (id, ws_id, display_name, email)
  VALUES (new_workspace_user_id, NEW.ws_id, user_display_name, user_email);

  -- Create link using the ID we just generated (direct reference, no email matching)
  INSERT INTO workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
  VALUES (NEW.user_id, new_workspace_user_id, NEW.ws_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER create_workspace_user_linked_user
  AFTER INSERT ON workspace_members 
  FOR EACH ROW 
  EXECUTE FUNCTION create_workspace_user_linked_user();

-- ============================================================================
-- STEP 3: Consolidation RPC for on-demand repair
-- ============================================================================

-- Drop existing function if it exists (for idempotent migration)
DROP FUNCTION IF EXISTS consolidate_workspace_user_links(uuid);
DROP FUNCTION IF EXISTS ensure_workspace_user_link(uuid, uuid);

-- Function to consolidate all missing links for a specific workspace (or all if null)
-- Returns the list of platform_user_id and ws_id pairs that were fixed
CREATE OR REPLACE FUNCTION consolidate_workspace_user_links(target_ws_id uuid DEFAULT NULL)
RETURNS TABLE(
  platform_user_id uuid,
  ws_id uuid,
  action text
) AS $$
DECLARE
  rec RECORD;
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
BEGIN
  FOR rec IN 
    SELECT wm.user_id, wm.ws_id
    FROM workspace_members wm
    WHERE (target_ws_id IS NULL OR wm.ws_id = target_ws_id)
      AND NOT EXISTS (
        SELECT 1 FROM workspace_user_linked_users wul
        WHERE wul.platform_user_id = wm.user_id
          AND wul.ws_id = wm.ws_id
      )
  LOOP
    -- Get user details
    SELECT u.display_name, COALESCE(upd.email, '')
    INTO user_display_name, user_email
    FROM users u
    LEFT JOIN user_private_details upd ON upd.user_id = u.id
    WHERE u.id = rec.user_id;

    -- Skip if user doesn't exist
    IF user_display_name IS NULL THEN
      CONTINUE;
    END IF;

    -- Generate and insert
    new_workspace_user_id := gen_random_uuid();

    INSERT INTO workspace_users (id, ws_id, display_name, email)
    VALUES (new_workspace_user_id, rec.ws_id, user_display_name, user_email);

    INSERT INTO workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
    VALUES (rec.user_id, new_workspace_user_id, rec.ws_id);

    RETURN QUERY SELECT rec.user_id, rec.ws_id, 'created'::text;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (RLS will handle authorization)
GRANT EXECUTE ON FUNCTION consolidate_workspace_user_links(uuid) TO authenticated;

-- Function to ensure a specific user has a workspace_user link (for single-user repair)
-- Returns the virtual_user_id (existing or newly created)
CREATE OR REPLACE FUNCTION ensure_workspace_user_link(
  target_user_id uuid,
  target_ws_id uuid
)
RETURNS uuid AS $$
DECLARE
  existing_virtual_user_id uuid;
  new_workspace_user_id uuid;
  user_display_name text;
  user_email text;
BEGIN
  -- Check if link already exists
  SELECT virtual_user_id INTO existing_virtual_user_id
  FROM workspace_user_linked_users
  WHERE platform_user_id = target_user_id
    AND ws_id = target_ws_id;

  IF existing_virtual_user_id IS NOT NULL THEN
    RETURN existing_virtual_user_id;
  END IF;

  -- Verify user is a workspace member
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE user_id = target_user_id
      AND ws_id = target_ws_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of workspace %', target_user_id, target_ws_id;
  END IF;

  -- Get user details
  SELECT u.display_name, COALESCE(upd.email, '')
  INTO user_display_name, user_email
  FROM users u
  LEFT JOIN user_private_details upd ON upd.user_id = u.id
  WHERE u.id = target_user_id;

  IF user_display_name IS NULL THEN
    RAISE EXCEPTION 'User % not found', target_user_id;
  END IF;

  -- Generate and insert
  new_workspace_user_id := gen_random_uuid();

  INSERT INTO workspace_users (id, ws_id, display_name, email)
  VALUES (new_workspace_user_id, target_ws_id, user_display_name, user_email);

  INSERT INTO workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
  VALUES (target_user_id, new_workspace_user_id, target_ws_id);

  RETURN new_workspace_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION ensure_workspace_user_link(uuid, uuid) TO authenticated;

-- ============================================================================
-- STEP 4: Add helpful comment to table
-- ============================================================================

COMMENT ON TABLE workspace_user_linked_users IS 
'Links platform users (auth users) to their workspace-specific user profiles (workspace_users).
Each workspace member should have exactly one entry per workspace.
Use ensure_workspace_user_link() to repair missing entries for individual users.
Use consolidate_workspace_user_links() to bulk repair all missing entries.';

COMMENT ON FUNCTION ensure_workspace_user_link(uuid, uuid) IS 
'Ensures a platform user has a workspace_user link in the specified workspace.
Creates the link if missing, returns the virtual_user_id (existing or newly created).
Throws an error if the user is not a workspace member.';

COMMENT ON FUNCTION consolidate_workspace_user_links(uuid) IS 
'Bulk repairs all missing workspace_user_linked_users entries.
Pass a workspace_id to repair only that workspace, or NULL to repair all.
Returns a table of (platform_user_id, ws_id, action) for each repaired entry.';
