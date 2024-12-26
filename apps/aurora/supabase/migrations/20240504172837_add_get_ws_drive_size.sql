CREATE OR REPLACE FUNCTION get_workspace_drive_size(ws_id UUID)
RETURNS BIGINT AS $$
DECLARE
    total_size BIGINT;
BEGIN
        SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO total_size
        FROM storage.objects
        WHERE bucket_id = 'workspaces'
        AND owner IS NOT NULL
        AND name ILIKE (ws_id || '/%')
        AND metadata->>'size' IS NOT NULL;
        
        RETURN total_size;
END;
$$ LANGUAGE plpgsql;