-- Single stable share link per task
-- - Exactly 1 row in task_share_links per task
-- - public_access is view-only for now
-- - invite-only implies no public access
-- - RLS: share-link rows selectable only when eligible (workspace member, public access, or invited)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'task_share_public_access'
  ) THEN
    CREATE TYPE public.task_share_public_access AS ENUM ('none', 'view');
  END IF;
END $$;

ALTER TABLE public.task_share_links
  ADD COLUMN IF NOT EXISTS public_access public.task_share_public_access NOT NULL DEFAULT 'none';

-- invite-only implies no public access
ALTER TABLE public.task_share_links
  DROP CONSTRAINT IF EXISTS task_share_links_invite_only_disables_public;
ALTER TABLE public.task_share_links
  ADD CONSTRAINT task_share_links_invite_only_disables_public
  CHECK (NOT requires_invite OR public_access = 'none');

-- Migrate existing data to exactly one link per task.
-- Keep the most recently created link for each task and re-point uses to it.
WITH ranked_links AS (
  SELECT
    id,
    task_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC, id DESC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY task_id ORDER BY created_at DESC, id DESC) AS keep_id
  FROM public.task_share_links
),
repoint_uses AS (
  UPDATE public.task_share_link_uses u
  SET share_link_id = rl.keep_id
  FROM ranked_links rl
  WHERE u.share_link_id = rl.id
    AND rl.rn > 1
  RETURNING 1
)
DELETE FROM public.task_share_links tsl
USING ranked_links rl
WHERE tsl.id = rl.id
  AND rl.rn > 1;

-- Enforce single link per task going forward
ALTER TABLE public.task_share_links
  DROP CONSTRAINT IF EXISTS task_share_links_task_id_unique;
ALTER TABLE public.task_share_links
  ADD CONSTRAINT task_share_links_task_id_unique UNIQUE (task_id);

-- Optimize email lookup for RLS policies
CREATE INDEX IF NOT EXISTS task_shares_task_id_lower_email_idx 
  ON public.task_shares (task_id, LOWER(shared_with_email)) 
  WHERE shared_with_email IS NOT NULL;

-- Ensure user_private_details email lookup is fast (it might already be unique/indexed, but good to ensure)
CREATE INDEX IF NOT EXISTS user_private_details_email_idx ON public.user_private_details(email);

-- Tighten RLS: share-link rows are only visible to eligible authenticated users.
-- (1) Workspace members
-- (2) Public access enabled (view)
-- (3) Explicitly invited recipients (task_shares by user_id or email)
DROP POLICY IF EXISTS "Allow authenticated users to lookup share links by code" ON public.task_share_links;
DROP POLICY IF EXISTS "Allow eligible users to view task share links" ON public.task_share_links;

CREATE POLICY "Allow eligible users to view task share links"
ON public.task_share_links
FOR SELECT
TO authenticated
USING (
  is_task_workspace_member(task_id)
  OR public_access = 'view'
  OR EXISTS (
    SELECT 1
    FROM public.task_shares ts
    WHERE ts.task_id = task_share_links.task_id
      AND (
        ts.shared_with_user_id = auth.uid()
        OR (
          ts.shared_with_email IS NOT NULL
          AND LOWER(ts.shared_with_email) = LOWER((SELECT email FROM public.user_private_details WHERE user_id = auth.uid()))
        )
      )
  )
);

-- Ensure task accessibility also includes public-access shared tasks.
CREATE OR REPLACE FUNCTION public.is_task_accessible(_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT EXISTS (SELECT 1 FROM tasks WHERE id = _task_id)
AND (
  -- User is workspace member
  EXISTS (
    SELECT 1
    FROM tasks t
    JOIN task_lists tl ON tl.id = t.list_id
    JOIN workspace_boards wb ON wb.id = tl.board_id
    JOIN workspace_members wm ON wm.ws_id = wb.ws_id
    WHERE t.id = _task_id AND wm.user_id = auth.uid()
  )
  OR
  -- User has a direct share by user_id
  EXISTS (
    SELECT 1 FROM task_shares ts
    WHERE ts.task_id = _task_id AND ts.shared_with_user_id = auth.uid()
  )
  OR
  -- User has a pending email share (matches their email)
  EXISTS (
    SELECT 1 FROM task_shares ts
    JOIN user_private_details upd ON upd.user_id = auth.uid()
    WHERE ts.task_id = _task_id AND LOWER(ts.shared_with_email) = LOWER(upd.email)
  )
  OR
  -- Task is publicly shareable (view-only) via the single share link
  EXISTS (
    SELECT 1
    FROM public.task_share_links tsl
    WHERE tsl.task_id = _task_id
      AND tsl.public_access = 'view'
  )
);
$$;
