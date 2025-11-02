-- Migration: Create sessions table for JWT token tracking
-- Description: Tracks active user sessions and refresh tokens
-- Created: 2025-01-03

-- Create sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_type VARCHAR(20) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to users table
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT token_type_valid CHECK (token_type IN ('access', 'refresh')),
    CONSTRAINT expires_in_future CHECK (expires_at > created_at)
);

-- Create indexes for better query performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(user_id, expires_at)
    WHERE revoked_at IS NULL;

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE expires_at < NOW() - INTERVAL '7 days'
       OR revoked_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE sessions IS 'Tracks JWT tokens and user sessions';
COMMENT ON COLUMN sessions.id IS 'Primary key - UUID v4';
COMMENT ON COLUMN sessions.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 hash of JWT token for revocation';
COMMENT ON COLUMN sessions.token_type IS 'Type of token: access or refresh';
COMMENT ON COLUMN sessions.ip_address IS 'IP address where session was created';
COMMENT ON COLUMN sessions.user_agent IS 'Browser/client user agent string';
COMMENT ON COLUMN sessions.expires_at IS 'When token expires';
COMMENT ON COLUMN sessions.revoked_at IS 'When token was manually revoked (null if active)';

-- Create function to revoke all user sessions (useful for logout-all)
CREATE OR REPLACE FUNCTION revoke_user_sessions(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE user_id = target_user_id
      AND revoked_at IS NULL
      AND expires_at > NOW();

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_user_sessions IS 'Revokes all active sessions for a user';
COMMENT ON FUNCTION cleanup_expired_sessions IS 'Deletes expired/revoked sessions older than 7 days';
