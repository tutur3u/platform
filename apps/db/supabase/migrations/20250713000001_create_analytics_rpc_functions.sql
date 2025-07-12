-- Create RPC functions for analytics calculations

-- Function to get top cities for a link
CREATE OR REPLACE FUNCTION get_top_cities(
    p_link_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    city TEXT,
    country TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(la.city, 'Unknown') AS city,
        COALESCE(la.country, 'Unknown') AS country,
        COUNT(*) AS count
    FROM link_analytics la
    WHERE la.link_id = p_link_id
    GROUP BY COALESCE(la.city, 'Unknown'), COALESCE(la.country, 'Unknown')
    ORDER BY count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get device types for a link
CREATE OR REPLACE FUNCTION get_device_types(
    p_link_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    device_type TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(la.device_type, 'Unknown') AS device_type,
        COUNT(*) AS count
    FROM link_analytics la
    WHERE la.link_id = p_link_id
    GROUP BY COALESCE(la.device_type, 'Unknown')
    ORDER BY count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get browsers for a link
CREATE OR REPLACE FUNCTION get_browsers(
    p_link_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    browser TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(la.browser, 'Unknown') AS browser,
        COUNT(*) AS count
    FROM link_analytics la
    WHERE la.link_id = p_link_id
    GROUP BY COALESCE(la.browser, 'Unknown')
    ORDER BY count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get operating systems for a link
CREATE OR REPLACE FUNCTION get_operating_systems(
    p_link_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    os TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(la.os, 'Unknown') AS os,
        COUNT(*) AS count
    FROM link_analytics la
    WHERE la.link_id = p_link_id
    GROUP BY COALESCE(la.os, 'Unknown')
    ORDER BY count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get clicks by hour for a link
CREATE OR REPLACE FUNCTION get_clicks_by_hour(
    p_link_id UUID
)
RETURNS TABLE(
    hour INTEGER,
    clicks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH hours AS (
        SELECT generate_series(0, 23) AS hour
    )
    SELECT 
        h.hour,
        COALESCE(COUNT(la.clicked_at), 0) AS clicks
    FROM hours h
    LEFT JOIN link_analytics la ON EXTRACT(HOUR FROM la.clicked_at) = h.hour
        AND la.link_id = p_link_id
    GROUP BY h.hour
    ORDER BY h.hour;
END;
$$ LANGUAGE plpgsql;

-- Function to get clicks by day of week for a link
CREATE OR REPLACE FUNCTION get_clicks_by_day_of_week(
    p_link_id UUID
)
RETURNS TABLE(
    day_of_week INTEGER,
    day_name TEXT,
    clicks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT 
            s AS day_of_week,
            CASE s
                WHEN 0 THEN 'Sunday'
                WHEN 1 THEN 'Monday'
                WHEN 2 THEN 'Tuesday'
                WHEN 3 THEN 'Wednesday'
                WHEN 4 THEN 'Thursday'
                WHEN 5 THEN 'Friday'
                WHEN 6 THEN 'Saturday'
            END AS day_name
        FROM generate_series(0, 6) AS s
    )
    SELECT 
        d.day_of_week,
        d.day_name,
        COALESCE(COUNT(la.clicked_at), 0) AS clicks
    FROM days d
    LEFT JOIN link_analytics la ON EXTRACT(DOW FROM la.clicked_at) = d.day_of_week
        AND la.link_id = p_link_id
    GROUP BY d.day_of_week, d.day_name
    ORDER BY d.day_of_week;
END;
$$ LANGUAGE plpgsql;
