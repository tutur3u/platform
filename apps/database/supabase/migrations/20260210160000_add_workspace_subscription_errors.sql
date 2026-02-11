-- Track workspaces where subscription operations fail (e.g. Polar rejects email)
CREATE TABLE workspace_subscription_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  error_message text NOT NULL,
  error_source text NOT NULL DEFAULT 'unknown',  -- 'webhook', 'cross_check', 'migration'
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Only one unresolved error per workspace (NULL resolved_at)
CREATE UNIQUE INDEX uq_workspace_subscription_errors_unresolved
  ON workspace_subscription_errors (ws_id)
  WHERE resolved_at IS NULL;

-- RLS: admin-only via SECURITY DEFINER RPCs (no direct client access needed)
ALTER TABLE workspace_subscription_errors ENABLE ROW LEVEL SECURITY;
