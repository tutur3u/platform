ALTER TABLE public.user_group_post_checks
ADD COLUMN IF NOT EXISTS approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE public.user_group_post_checks AS checks
SET
    approval_status = posts.post_approval_status,
    approved_by = COALESCE(
        approved_workspace_user.id,
        approved_link.virtual_user_id
    ),
    approved_at = posts.approved_at,
    rejected_by = COALESCE(
        rejected_workspace_user.id,
        rejected_link.virtual_user_id
    ),
    rejected_at = posts.rejected_at,
    rejection_reason = posts.rejection_reason
FROM public.user_group_posts AS posts
JOIN public.workspace_user_groups AS groups
    ON groups.id = posts.group_id
LEFT JOIN public.workspace_users AS approved_workspace_user
    ON approved_workspace_user.id = posts.approved_by
   AND approved_workspace_user.ws_id = groups.ws_id
LEFT JOIN public.workspace_user_linked_users AS approved_link
    ON approved_link.platform_user_id = posts.approved_by
   AND approved_link.ws_id = groups.ws_id
LEFT JOIN public.workspace_users AS rejected_workspace_user
    ON rejected_workspace_user.id = posts.rejected_by
   AND rejected_workspace_user.ws_id = groups.ws_id
LEFT JOIN public.workspace_user_linked_users AS rejected_link
    ON rejected_link.platform_user_id = posts.rejected_by
   AND rejected_link.ws_id = groups.ws_id
WHERE posts.id = checks.post_id
  AND (
    checks.approval_status IS DISTINCT FROM posts.post_approval_status
    OR checks.approved_by IS DISTINCT FROM COALESCE(
        approved_workspace_user.id,
        approved_link.virtual_user_id
    )
    OR checks.approved_at IS DISTINCT FROM posts.approved_at
    OR checks.rejected_by IS DISTINCT FROM COALESCE(
        rejected_workspace_user.id,
        rejected_link.virtual_user_id
    )
    OR checks.rejected_at IS DISTINCT FROM posts.rejected_at
    OR checks.rejection_reason IS DISTINCT FROM posts.rejection_reason
  );

CREATE INDEX IF NOT EXISTS user_group_post_checks_post_approval_status_idx
ON public.user_group_post_checks (post_id, approval_status);

CREATE INDEX IF NOT EXISTS user_group_post_checks_user_approval_status_idx
ON public.user_group_post_checks (user_id, approval_status);
