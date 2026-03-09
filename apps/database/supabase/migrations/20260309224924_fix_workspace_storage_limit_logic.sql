-- Fix workspace storage limit resolution logic
-- 1. Resolve variable shadowing of ws_id in get_workspace_storage_limit
-- 2. Restore ROOT_WORKSPACE_ID exclusion to allow 1TB for root
-- 3. Safely handle non-UUID paths when extracting workspace ID from storage object names

DROP FUNCTION IF EXISTS public.get_workspace_storage_limit(uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_storage_limit(p_ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    v_ws_tier text;
    v_storage_limit BIGINT;
BEGIN
    -- If workspace_id is the root workspace, set storage_limit to 1TB
    IF p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RETURN 1099511627776; -- 1TB in bytes
    END IF;

    -- Get the highest tier subscription for this workspace
    -- We filter by active, trialing, or past_due statuses
    SELECT p.tier::text INTO v_ws_tier
    FROM workspace_subscriptions s
    JOIN workspace_subscription_products p ON s.product_id = p.id
    WHERE s.ws_id = p_ws_id
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
    IF v_ws_tier IN ('PRO', 'ENTERPRISE') THEN
        v_storage_limit := 107374182400; -- 100GB in bytes
    ELSIF v_ws_tier = 'PLUS' THEN
        v_storage_limit := 21474836480; -- 20GB in bytes
    ELSE
        v_storage_limit := 104857600; -- Default / FREE: 100MB in bytes
    END IF;

    RETURN v_storage_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update the check_workspace_storage_limit trigger function to use the dynamic limit
-- and safely extract and parse the workspace ID to prevent runtime casting errors
CREATE OR REPLACE FUNCTION check_workspace_storage_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id uuid;
    v_current_size BIGINT;
    v_storage_limit BIGINT;
    v_ws_id_text text;
BEGIN
    -- Extract workspace ID from the object name (format: wsId/path/to/file)
    v_ws_id_text := split_part(NEW.name, '/', 1);
    
    -- Safely cast to UUID
    BEGIN
        v_workspace_id := v_ws_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        -- If it's not a valid UUID format, we raise an exception to prevent uploads
        RAISE EXCEPTION 'Invalid workspace ID format in path: %', v_ws_id_text;
    END;
    
    -- Get the dynamic storage limit for the workspace
    v_storage_limit := public.get_workspace_storage_limit(v_workspace_id);
    
    -- Calculate current workspace storage size
    -- We match using text comparison to avoid cast errors on existing invalid paths
    SELECT COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
    INTO v_current_size
    FROM storage.objects
    WHERE bucket_id = 'workspaces'
      AND split_part(name, '/', 1) = v_ws_id_text
      AND owner IS NOT NULL;
    
    -- Add the size of the new object being inserted
    v_current_size := v_current_size + COALESCE((NEW.metadata->>'size')::BIGINT, 0);
    
    -- Check if storage limit would be exceeded
    IF v_current_size > v_storage_limit THEN
        RAISE EXCEPTION 'Storage limit exceeded. Maximum storage per workspace is % bytes. Current usage would be: % bytes', v_storage_limit, v_current_size;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
