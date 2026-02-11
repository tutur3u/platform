-- Migration: Add workspace encryption keys for E2EE at rest
-- This table stores per-workspace encryption keys (encrypted with master key)

-- Create the workspace_encryption_keys table
CREATE TABLE IF NOT EXISTS public.workspace_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workspace_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Create index for ws_id lookups
CREATE INDEX IF NOT EXISTS idx_workspace_encryption_keys_ws_id 
ON public.workspace_encryption_keys(ws_id);

-- RLS Policy: Only allow access through service role (server-side only)
-- We don't want clients to access encryption keys directly
CREATE POLICY "Service role only access"
ON public.workspace_encryption_keys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add is_encrypted column to workspace_calendar_events
ALTER TABLE public.workspace_calendar_events 
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false;

-- Add updated_at column to workspace_encryption_keys for key rotation tracking
CREATE OR REPLACE FUNCTION update_workspace_encryption_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workspace_encryption_keys_updated_at
    BEFORE UPDATE ON public.workspace_encryption_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_encryption_keys_updated_at();

-- Comment on table for documentation
COMMENT ON TABLE public.workspace_encryption_keys IS 'Stores per-workspace encryption keys for E2EE at rest. Keys are encrypted with a master key stored in environment variables.';
COMMENT ON COLUMN public.workspace_encryption_keys.encrypted_key IS 'AES-256 key encrypted with master key, base64 encoded';
COMMENT ON COLUMN public.workspace_encryption_keys.key_version IS 'Version number for key rotation support';
