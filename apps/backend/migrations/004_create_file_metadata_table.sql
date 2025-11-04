-- Migration: Create file_metadata table
-- Description: Tracks uploaded files and their metadata
-- Created: 2025-01-03

-- Create file_metadata table
CREATE TABLE file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Foreign key to users table
    CONSTRAINT fk_file_metadata_uploader FOREIGN KEY (uploader_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT filename_not_empty CHECK (length(trim(filename)) > 0),
    CONSTRAINT size_positive CHECK (size_bytes > 0),
    CONSTRAINT download_count_positive CHECK (download_count >= 0),
    CONSTRAINT checksum_format CHECK (checksum_sha256 ~* '^[a-f0-9]{64}$')
);

-- Create indexes for better query performance
CREATE INDEX idx_file_metadata_uploader_id ON file_metadata(uploader_id);
CREATE INDEX idx_file_metadata_filename ON file_metadata(filename);
CREATE INDEX idx_file_metadata_mime_type ON file_metadata(mime_type);
CREATE INDEX idx_file_metadata_checksum ON file_metadata(checksum_sha256);
CREATE INDEX idx_file_metadata_created_at ON file_metadata(created_at DESC);
CREATE INDEX idx_file_metadata_active ON file_metadata(uploader_id, created_at)
    WHERE deleted_at IS NULL;

-- Add trigger to automatically update updated_at
CREATE TRIGGER file_metadata_updated_at
    BEFORE UPDATE ON file_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to get storage usage by user
CREATE OR REPLACE FUNCTION get_user_storage_usage(target_user_id UUID)
RETURNS TABLE(
    total_files BIGINT,
    total_bytes BIGINT,
    public_files BIGINT,
    private_files BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_files,
        COALESCE(SUM(size_bytes), 0)::BIGINT as total_bytes,
        COUNT(*) FILTER (WHERE is_public = TRUE)::BIGINT as public_files,
        COUNT(*) FILTER (WHERE is_public = FALSE)::BIGINT as private_files
    FROM file_metadata
    WHERE uploader_id = target_user_id
      AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up soft-deleted files older than 30 days
CREATE OR REPLACE FUNCTION cleanup_deleted_files()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM file_metadata
    WHERE deleted_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE file_metadata IS 'Metadata for uploaded files';
COMMENT ON COLUMN file_metadata.id IS 'Primary key - UUID v4';
COMMENT ON COLUMN file_metadata.uploader_id IS 'Foreign key to users table';
COMMENT ON COLUMN file_metadata.filename IS 'Stored filename (may be renamed)';
COMMENT ON COLUMN file_metadata.original_filename IS 'Original filename from upload';
COMMENT ON COLUMN file_metadata.file_path IS 'Full path to file on disk/storage';
COMMENT ON COLUMN file_metadata.mime_type IS 'MIME type (e.g., image/jpeg)';
COMMENT ON COLUMN file_metadata.size_bytes IS 'File size in bytes';
COMMENT ON COLUMN file_metadata.checksum_sha256 IS 'SHA-256 hash for integrity verification';
COMMENT ON COLUMN file_metadata.is_public IS 'Whether file is publicly accessible';
COMMENT ON COLUMN file_metadata.download_count IS 'Number of times file has been downloaded';
COMMENT ON COLUMN file_metadata.deleted_at IS 'Soft delete timestamp (null if active)';

COMMENT ON FUNCTION get_user_storage_usage IS 'Returns storage statistics for a user';
COMMENT ON FUNCTION cleanup_deleted_files IS 'Permanently deletes files soft-deleted >30 days ago';
