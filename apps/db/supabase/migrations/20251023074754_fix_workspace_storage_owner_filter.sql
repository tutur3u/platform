-- Fix workspace storage RPC functions to work with API key authentication
--
-- When using admin client for API operations, uploaded files don't have an owner set.
-- The previous RPC functions filtered by "owner IS NOT NULL", which caused files
-- uploaded via API to be excluded from size calculations and counts.
--
-- This migration:
-- 1. Removes the owner filter for the workspaces bucket
-- 2. Makes storage limits configurable via workspace_secrets
-- 3. Defaults to 100MB if no limit is configured

-- Helper function to get workspace storage limit from workspace_secrets
-- Falls back to 100MB (104857600 bytes) if not configured
CREATE OR REPLACE FUNCTION get_workspace_storage_limit(ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    limit_value TEXT;
    storage_limit BIGINT;
BEGIN
    -- Try to get storage_limit from workspace_secrets
    SELECT value INTO limit_value
    FROM public.workspace_secrets
    WHERE workspace_secrets.ws_id = get_workspace_storage_limit.ws_id
      AND name = 'STORAGE_LIMIT_BYTES'
    LIMIT 1;

    -- If found, parse as BIGINT, otherwise use 100MB default
    IF limit_value IS NOT NULL THEN
        BEGIN
            storage_limit := limit_value::BIGINT;
        EXCEPTION WHEN OTHERS THEN
            -- If parsing fails, use default
            storage_limit := 104857600; -- 100MB
        END;
    ELSE
        storage_limit := 104857600; -- 100MB default
    END IF;

    RETURN storage_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update storage limit check function
CREATE OR REPLACE FUNCTION check_workspace_storage_limit()
RETURNS TRIGGER AS $$
DECLARE
    workspace_id uuid;
    current_size BIGINT;
    storage_limit BIGINT;
BEGIN
    -- Extract workspace ID from the object name (format: wsId/path/to/file)
    workspace_id := split_part(NEW.name, '/', 1)::uuid;

    -- Get storage limit from workspace_secrets (defaults to 100MB)
    storage_limit := get_workspace_storage_limit(workspace_id);

    -- Calculate current workspace storage size
    -- REMOVED: AND owner IS NOT NULL filter
    SELECT COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
    INTO current_size
    FROM storage.objects
    WHERE bucket_id = 'workspaces'
      AND split_part(name, '/', 1)::uuid = workspace_id;

    -- Add the size of the new object being inserted
    current_size := current_size + COALESCE((NEW.metadata->>'size')::BIGINT, 0);

    -- Check if storage limit would be exceeded
    IF current_size > storage_limit THEN
        RAISE EXCEPTION 'Storage limit exceeded. Maximum storage per workspace is % bytes. Current usage would be: % bytes', storage_limit, current_size;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update get_workspace_drive_size function to not filter by owner
CREATE OR REPLACE FUNCTION get_workspace_drive_size(ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    total_size BIGINT;
BEGIN
    -- REMOVED: AND owner IS NOT NULL filter
    SELECT COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
    INTO total_size
    FROM storage.objects
    WHERE bucket_id = 'workspaces'
      AND split_part(name, '/', 1)::uuid = ws_id;

    RETURN total_size;
END;
$$ LANGUAGE plpgsql;
