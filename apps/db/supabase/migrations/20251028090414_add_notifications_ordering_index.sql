-- Add composite index for optimal query performance with consistent ordering
-- This ensures notifications are always returned in the same order for a given user
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC, id DESC);

-- Add composite index for workspace filtering with consistent ordering
CREATE INDEX IF NOT EXISTS idx_notifications_ws_created
  ON public.notifications(ws_id, created_at DESC, id DESC)
  WHERE ws_id IS NOT NULL;

-- Add composite index for user-scoped (null ws_id) notifications with consistent ordering
CREATE INDEX IF NOT EXISTS idx_notifications_user_scope_created
  ON public.notifications(user_id, scope, created_at DESC, id DESC)
  WHERE scope = 'user' AND ws_id IS NULL;

-- Comment explaining the index strategy
COMMENT ON INDEX idx_notifications_user_created IS 'Composite index for consistent notification ordering by user. Ensures notifications are always returned in the same order (created_at DESC, id DESC) for efficient pagination and stable UI.';
COMMENT ON INDEX idx_notifications_ws_created IS 'Composite index for workspace-scoped notifications with consistent ordering.';
COMMENT ON INDEX idx_notifications_user_scope_created IS 'Composite index for user-scoped notifications (null ws_id) with consistent ordering.';
