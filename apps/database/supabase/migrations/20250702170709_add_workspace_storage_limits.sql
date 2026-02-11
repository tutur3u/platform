-- Storage limit for workspaces (50MB = 52428800 bytes)
CREATE OR REPLACE FUNCTION check_workspace_storage_limit()
RETURNS TRIGGER AS $$
DECLARE
    workspace_id uuid;
    current_size BIGINT;
    storage_limit BIGINT := 52428800; -- 50MB in bytes
BEGIN
    -- Extract workspace ID from the object name (format: wsId/path/to/file)
    workspace_id := split_part(NEW.name, '/', 1)::uuid;
    
    -- If workspace_id is the nil uuid, set storage_limit to 100GB
    IF workspace_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        storage_limit := 107374182400; -- 100GB in bytes
    END IF;
    
    -- Calculate current workspace storage size
    SELECT COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
    INTO current_size
    FROM storage.objects
    WHERE bucket_id = 'workspaces'
      AND split_part(name, '/', 1)::uuid = workspace_id
      AND owner IS NOT NULL;
    
    -- Add the size of the new object being inserted
    current_size := current_size + COALESCE((NEW.metadata->>'size')::BIGINT, 0);
    
    -- Check if storage limit would be exceeded
    IF current_size > storage_limit THEN
        RAISE EXCEPTION 'Storage limit exceeded. Maximum storage per workspace is % bytes. Current usage would be: % bytes', storage_limit, current_size;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check storage limit on insert/update
DROP TRIGGER IF EXISTS enforce_workspace_storage_limit ON storage.objects;
CREATE TRIGGER enforce_workspace_storage_limit
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW
    WHEN (NEW.bucket_id = 'workspaces')
    EXECUTE FUNCTION check_workspace_storage_limit();

-- Drop previous versions to avoid overload ambiguity
DROP FUNCTION IF EXISTS public.get_workspace_drive_size(text);

-- Function to get current workspace storage usage (uuid)
CREATE OR REPLACE FUNCTION get_workspace_drive_size(ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    total_size BIGINT;
BEGIN
    SELECT COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
    INTO total_size
    FROM storage.objects
    WHERE bucket_id = 'workspaces'
      AND split_part(name, '/', 1)::uuid = ws_id
      AND owner IS NOT NULL;
    
    RETURN total_size;
END;
$$ LANGUAGE plpgsql;

-- Drop previous version of get_workspace_storage_limit if exists
DROP FUNCTION IF EXISTS public.get_workspace_storage_limit();

-- Function to get workspace storage limit (for consistency)
CREATE OR REPLACE FUNCTION get_workspace_storage_limit(ws_id uuid)
RETURNS BIGINT AS $$
BEGIN
    IF ws_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RETURN 107374182400; -- 100GB in bytes
    END IF;
    RETURN 52428800; -- 50MB in bytes
END;
$$ LANGUAGE plpgsql;
