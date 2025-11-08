--
-- Fix workspace_members_and_invites view to include actual members
--
-- The previous migration (20251104101455) accidentally removed the section
-- that shows actual workspace members, only keeping invites and email invites.
-- This migration restores the complete view with all three parts:
-- 1. Invited users (pending)
-- 2. Actual workspace members (not pending)
-- 3. Email invites (pending)
--

create or replace view "public"."workspace_members_and_invites" WITH (security_invoker=on) as
-- Part 1: Invited users (people who have been sent an invite but haven't joined yet)
SELECT
  wi.ws_id,
  u.id,
  u.handle,
  NULL::text AS email,
  u.display_name,
  u.avatar_url,
  COALESCE(wm.created_at, wi.created_at) AS created_at,
  (wm.user_id IS NULL) AS pending
FROM workspace_invites wi
LEFT JOIN workspace_members wm ON wi.user_id = wm.user_id AND wi.ws_id = wm.ws_id
JOIN users u ON wi.user_id = u.id

UNION

-- Part 2: Actual workspace members (people who have already joined)
SELECT
  wm.ws_id,
  wm.user_id AS id,
  u.handle,
  upd.email,
  u.display_name,
  u.avatar_url,
  wm.created_at,
  false AS pending
FROM workspace_members wm
JOIN users u ON wm.user_id = u.id
JOIN user_private_details upd ON upd.user_id = u.id

UNION

-- Part 3: Email invites (pending invitations sent to email addresses)
SELECT
  wei.ws_id,
  NULL::uuid AS id,
  NULL::text AS handle,
  wei.email,
  NULL::text AS display_name,
  NULL::text AS avatar_url,
  wei.created_at,
  true AS pending
FROM workspace_email_invites wei;
