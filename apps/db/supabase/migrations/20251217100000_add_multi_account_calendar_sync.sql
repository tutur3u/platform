-- Multi-account calendar sync support
-- Adds provider and account tracking to calendar_auth_tokens table

-- Add new columns for multi-provider support
ALTER TABLE "public"."calendar_auth_tokens" 
ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'google';

ALTER TABLE "public"."calendar_auth_tokens" 
ADD COLUMN IF NOT EXISTS "account_email" text;

ALTER TABLE "public"."calendar_auth_tokens" 
ADD COLUMN IF NOT EXISTS "account_name" text;

ALTER TABLE "public"."calendar_auth_tokens" 
ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

ALTER TABLE "public"."calendar_auth_tokens" 
ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- Create provider enum type constraint
ALTER TABLE "public"."calendar_auth_tokens"
ADD CONSTRAINT "calendar_auth_tokens_provider_check" 
CHECK (provider IN ('google', 'microsoft'));

-- Create unique index for provider + account per workspace per user
-- This allows multiple accounts per provider per workspace per user
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_auth_tokens_user_ws_provider_email_key" 
ON "public"."calendar_auth_tokens" (user_id, ws_id, provider, account_email)
WHERE account_email IS NOT NULL;

-- Add auth_token_id to calendar_connections to track which account a connection belongs to
ALTER TABLE "public"."calendar_connections" 
ADD COLUMN IF NOT EXISTS "auth_token_id" uuid;

-- Add foreign key constraint
ALTER TABLE "public"."calendar_connections"
ADD CONSTRAINT "calendar_connections_auth_token_id_fkey" 
FOREIGN KEY (auth_token_id) REFERENCES calendar_auth_tokens(id) 
ON UPDATE CASCADE ON DELETE SET NULL;

-- Create index for faster lookups by auth_token_id
CREATE INDEX IF NOT EXISTS "calendar_connections_auth_token_id_idx" 
ON "public"."calendar_connections" (auth_token_id);

-- Add provider column to calendar_connections for easier querying
ALTER TABLE "public"."calendar_connections" 
ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'google';

ALTER TABLE "public"."calendar_connections"
ADD CONSTRAINT "calendar_connections_provider_check" 
CHECK (provider IN ('google', 'microsoft'));

-- Comment documenting the schema
COMMENT ON COLUMN "public"."calendar_auth_tokens"."provider" IS 'OAuth provider: google or microsoft';
COMMENT ON COLUMN "public"."calendar_auth_tokens"."account_email" IS 'Email address of the connected account';
COMMENT ON COLUMN "public"."calendar_auth_tokens"."account_name" IS 'Display name of the connected account';
COMMENT ON COLUMN "public"."calendar_auth_tokens"."expires_at" IS 'When the access token expires, used for proactive refresh';
COMMENT ON COLUMN "public"."calendar_auth_tokens"."is_active" IS 'Whether this connection is active (soft delete)';
COMMENT ON COLUMN "public"."calendar_connections"."auth_token_id" IS 'Reference to the auth token for this calendar connection';
COMMENT ON COLUMN "public"."calendar_connections"."provider" IS 'OAuth provider for this calendar connection';
