-- Update the workspace storage limits for different tiers
-- Free: 100MB (104857600 bytes)
-- Plus: 20GB (21474836480 bytes)
-- Pro/Enterprise: 100GB (107374182400 bytes)

-- Function to get workspace storage limit based on subscription tier
CREATE OR REPLACE FUNCTION public.get_workspace_storage_limit(ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    ws_tier text;
    storage_limit BIGINT;
BEGIN
    -- Get the highest tier subscription for this workspace
    SELECT p.tier::text INTO ws_tier
    FROM workspace_subscriptions s
    JOIN workspace_subscription_products p ON s.product_id = p.id
    WHERE s.ws_id = ws_id
      AND s.status IN ('active', 'trialing', 'past_due')
    ORDER BY
        CASE p.tier
            WHEN 'ENTERPRISE' THEN 4
            WHEN 'PRO' THEN 3
            WHEN 'PLUS' THEN 2
            WHEN 'FREE' THEN 1
            ELSE 0
        END DESC
    LIMIT 1;

    -- Set storage limit based on tier
    IF ws_tier IN ('PRO', 'ENTERPRISE') THEN
        storage_limit := 107374182400; -- 100GB in bytes
    ELSIF ws_tier = 'PLUS' THEN
        storage_limit := 21474836480; -- 20GB in bytes
    ELSE
        storage_limit := 104857600; -- Default / FREE: 100MB in bytes
    END IF;

    RETURN storage_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the check_workspace_storage_limit trigger function to use the dynamic limit
CREATE OR REPLACE FUNCTION check_workspace_storage_limit()
RETURNS TRIGGER AS $$
DECLARE
    workspace_id uuid;
    current_size BIGINT;
    storage_limit BIGINT;
BEGIN
    -- Extract workspace ID from the object name (format: wsId/path/to/file)
    workspace_id := split_part(NEW.name, '/', 1)::uuid;
    
    -- Get the dynamic storage limit for the workspace
    storage_limit := public.get_workspace_storage_limit(workspace_id);
    
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
