-- Respect explicit workspace storage overrides before subscription-tier defaults.
-- This keeps STORAGE_LIMIT_BYTES authoritative for uploads, analytics, and quota checks.

CREATE OR REPLACE FUNCTION public.get_workspace_storage_limit(p_ws_id uuid)
RETURNS BIGINT AS $$
DECLARE
    v_limit_value TEXT;
    v_ws_tier TEXT;
    v_storage_limit BIGINT;
BEGIN
    SELECT value
    INTO v_limit_value
    FROM public.workspace_secrets
    WHERE ws_id = p_ws_id
      AND name = 'STORAGE_LIMIT_BYTES'
    LIMIT 1;

    IF v_limit_value IS NOT NULL THEN
        BEGIN
            RETURN v_limit_value::BIGINT;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    IF p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RETURN 1099511627776; -- 1TB in bytes
    END IF;

    SELECT p.tier::TEXT
    INTO v_ws_tier
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
