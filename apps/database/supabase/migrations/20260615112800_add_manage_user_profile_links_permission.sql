-- Add a new workspace role permission gating management of external
-- profile-completion links (workspace_user_profile_links).
-- Keep this enum-value addition in its own migration so the value is committed
-- before it is referenced by RLS policies in a later migration.
ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_user_profile_links';
