-- Add workspace_api_key_usage_logs table for detailed API key usage tracking
-- This migration creates a comprehensive logging system for API key usage
-- with automatic cleanup of logs older than 90 days

-- Create the usage logs table
CREATE TABLE IF NOT EXISTS "public"."workspace_api_key_usage_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "api_key_id" UUID NOT NULL REFERENCES "public"."workspace_api_keys"(id) ON DELETE CASCADE,
  "ws_id" UUID NOT NULL REFERENCES "public"."workspaces"(id) ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "response_time_ms" INTEGER,
  "request_params" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_workspace_api_key_usage_logs_api_key_id
  ON "public"."workspace_api_key_usage_logs"(api_key_id);

CREATE INDEX IF NOT EXISTS idx_workspace_api_key_usage_logs_created_at
  ON "public"."workspace_api_key_usage_logs"(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_api_key_usage_logs_ws_id
  ON "public"."workspace_api_key_usage_logs"(ws_id);

-- Composite index for common queries (api_key_id + created_at)
CREATE INDEX IF NOT EXISTS idx_workspace_api_key_usage_logs_key_id_created
  ON "public"."workspace_api_key_usage_logs"(api_key_id, created_at DESC);

-- Create RLS policies

-- Enable RLS
ALTER TABLE "public"."workspace_api_key_usage_logs" ENABLE ROW LEVEL SECURITY;

-- Allow workspace members with manage_api_keys permission to view usage logs
CREATE POLICY "Allow authorized members to view usage logs"
  ON "public"."workspace_api_key_usage_logs"
  FOR SELECT
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_key_usage_logs.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_key_usage_logs.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_key_usage_logs.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_key_usage_logs.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  );

-- System can insert usage logs (no user permission required for logging)
CREATE POLICY "Allow system to insert usage logs"
  ON "public"."workspace_api_key_usage_logs"
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Create function to clean up old logs (>90 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_key_usage_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM "public"."workspace_api_key_usage_logs"
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

-- Create a scheduled job to run cleanup daily (using pg_cron if available)
-- Note: pg_cron might not be available in all Supabase projects
-- If not available, this can be triggered manually or via a scheduled function
COMMENT ON FUNCTION cleanup_old_api_key_usage_logs() IS 'Deletes API key usage logs older than 90 days. Should be run daily via cron or scheduled job.';

-- Add table and column comments for documentation
COMMENT ON TABLE "public"."workspace_api_key_usage_logs" IS 'Detailed usage logs for API keys with 90-day retention';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."api_key_id" IS 'Reference to the API key that was used';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."ws_id" IS 'Reference to the workspace';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."endpoint" IS 'The API endpoint that was called (e.g., /api/v1/workspaces/[wsId]/datasets)';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."method" IS 'HTTP method used (GET, POST, PUT, DELETE, etc.)';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."status_code" IS 'HTTP response status code (200, 401, 500, etc.)';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."ip_address" IS 'IP address of the client making the request';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."user_agent" IS 'User agent string from the request';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."response_time_ms" IS 'Response time in milliseconds';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."request_params" IS 'Request parameters (query params and body) stored as JSONB';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."error_message" IS 'Error message if the request failed';
COMMENT ON COLUMN "public"."workspace_api_key_usage_logs"."created_at" IS 'Timestamp when the request was made';
