-- Add invite-only flag to task share links
-- When requires_invite = true, only explicitly shared recipients (task_shares)
-- or workspace members should be able to access the link.

ALTER TABLE public.task_share_links
ADD COLUMN IF NOT EXISTS requires_invite boolean NOT NULL DEFAULT false;
