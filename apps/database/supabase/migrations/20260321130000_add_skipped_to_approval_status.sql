-- Add SKIPPED value to approval_status enum so old approved posts that exceed
-- the 60-day email window can be marked as auto-skipped in user_group_post_checks
-- rather than remaining permanently in an APPROVED state.
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'SKIPPED';
