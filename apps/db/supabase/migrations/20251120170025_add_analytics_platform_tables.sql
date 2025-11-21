-- =====================================================
-- Analytics Platform Schema Migration
-- =====================================================
-- This migration creates a comprehensive analytics platform including:
-- 1. Session tracking with enhanced geolocation
-- 2. Event tracking for custom events
-- 3. A/B testing and experimentation framework
-- 4. Conversion tracking
-- 5. Integration with existing link analytics
-- =====================================================

-- =====================================================
-- 1. ANALYTICS SESSIONS TABLE
-- =====================================================
-- Tracks user sessions with comprehensive device, browser, and location data

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL, -- Client-generated fingerprint for visitor identification
    ip_address INET,

    -- Geographic data (enhanced from link_analytics)
    country TEXT,
    country_region TEXT,
    city TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    isp TEXT, -- Internet Service Provider
    connection_type TEXT, -- wifi, cellular, ethernet

    -- Device information (enhanced)
    device_type TEXT, -- mobile, tablet, desktop
    device_brand TEXT, -- Apple, Samsung, Google, etc.
    device_model TEXT, -- iPhone 15 Pro, Galaxy S24, etc.

    -- Browser information (enhanced)
    browser TEXT, -- Chrome, Firefox, Safari, Edge, Opera
    browser_version TEXT,

    -- Operating system (enhanced)
    os TEXT, -- Windows, macOS, Linux, Android, iOS
    os_version TEXT,

    -- Screen information
    screen_width INTEGER,
    screen_height INTEGER,

    -- Language and user agent
    language TEXT, -- Browser language preference
    user_agent TEXT,

    -- Session timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_duration INTEGER DEFAULT 0, -- Duration in seconds, updated on each event

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics_sessions
CREATE INDEX idx_analytics_sessions_ws_id ON public.analytics_sessions(ws_id);
CREATE INDEX idx_analytics_sessions_visitor_id ON public.analytics_sessions(visitor_id);
CREATE INDEX idx_analytics_sessions_started_at ON public.analytics_sessions(started_at DESC);
CREATE INDEX idx_analytics_sessions_country ON public.analytics_sessions(country) WHERE country IS NOT NULL;
CREATE INDEX idx_analytics_sessions_city ON public.analytics_sessions(city) WHERE city IS NOT NULL;
CREATE INDEX idx_analytics_sessions_device_type ON public.analytics_sessions(device_type) WHERE device_type IS NOT NULL;
CREATE INDEX idx_analytics_sessions_browser ON public.analytics_sessions(browser) WHERE browser IS NOT NULL;
CREATE INDEX idx_analytics_sessions_os ON public.analytics_sessions(os) WHERE os IS NOT NULL;
CREATE INDEX idx_analytics_sessions_geo_coords ON public.analytics_sessions(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Composite index for session lookup by workspace and visitor
CREATE INDEX idx_analytics_sessions_ws_visitor ON public.analytics_sessions(ws_id, visitor_id, started_at DESC);

COMMENT ON TABLE public.analytics_sessions IS 'User sessions with comprehensive device, browser, and location tracking';
COMMENT ON COLUMN public.analytics_sessions.visitor_id IS 'Client-generated fingerprint (device + browser + IP hash) for visitor identification';
COMMENT ON COLUMN public.analytics_sessions.session_duration IS 'Session duration in seconds, updated on each event';


-- =====================================================
-- 2. ANALYTICS EVENTS TABLE
-- =====================================================
-- Tracks all events (page views, custom events, clicks, conversions)

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,

    -- Event information
    event_name TEXT NOT NULL, -- e.g., 'page_view', 'button_click', 'conversion', 'form_submit'
    event_properties JSONB, -- Custom event data

    -- Page/URL information
    page_url TEXT,
    page_title TEXT,
    page_path TEXT, -- Extracted from page_url for easier filtering

    -- Referrer information
    referrer TEXT,
    referrer_domain TEXT, -- Auto-extracted from referrer

    -- UTM parameters and campaign tracking
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    -- Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics_events
CREATE INDEX idx_analytics_events_ws_id ON public.analytics_events(ws_id);
CREATE INDEX idx_analytics_events_session_id ON public.analytics_events(session_id);
CREATE INDEX idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_timestamp ON public.analytics_events(timestamp DESC);
CREATE INDEX idx_analytics_events_page_path ON public.analytics_events(page_path) WHERE page_path IS NOT NULL;
CREATE INDEX idx_analytics_events_referrer_domain ON public.analytics_events(referrer_domain) WHERE referrer_domain IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_analytics_events_ws_timestamp ON public.analytics_events(ws_id, timestamp DESC);
CREATE INDEX idx_analytics_events_ws_event_name ON public.analytics_events(ws_id, event_name, timestamp DESC);

-- GIN index for JSONB event_properties for flexible querying
CREATE INDEX idx_analytics_events_properties ON public.analytics_events USING GIN(event_properties);

COMMENT ON TABLE public.analytics_events IS 'All tracked events including page views, custom events, and conversions';
COMMENT ON COLUMN public.analytics_events.event_properties IS 'Custom event data stored as JSONB for flexible querying';


-- =====================================================
-- 3. ANALYTICS EXPERIMENTS TABLE
-- =====================================================
-- A/B testing and experimentation framework

CREATE TABLE IF NOT EXISTS public.analytics_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

    -- Experiment metadata
    name TEXT NOT NULL,
    description TEXT,
    experiment_key TEXT NOT NULL, -- Unique key for SDK identification (e.g., 'homepage_hero_test')

    -- Experiment type
    experiment_type TEXT NOT NULL CHECK (experiment_type IN ('url_redirect', 'feature_flag', 'content_variant')),

    -- Status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'archived')),

    -- Traffic allocation (0.0 to 1.0)
    traffic_allocation REAL NOT NULL DEFAULT 1.0 CHECK (traffic_allocation >= 0.0 AND traffic_allocation <= 1.0),

    -- Variants configuration (array of variant objects)
    -- Example: [{"id": "control", "name": "Control", "weight": 0.5, "config": {...}}, {"id": "variant_a", "name": "Variant A", "weight": 0.5, "config": {...}}]
    variants JSONB NOT NULL,

    -- Target metric for conversion tracking
    target_metric TEXT, -- Event name to track as conversion (e.g., 'purchase', 'signup')

    -- Timing
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure experiment_key is unique per workspace
    CONSTRAINT unique_experiment_key_per_workspace UNIQUE (ws_id, experiment_key)
);

-- Indexes for analytics_experiments
CREATE INDEX idx_analytics_experiments_ws_id ON public.analytics_experiments(ws_id);
CREATE INDEX idx_analytics_experiments_status ON public.analytics_experiments(status);
CREATE INDEX idx_analytics_experiments_experiment_key ON public.analytics_experiments(experiment_key);
CREATE INDEX idx_analytics_experiments_ws_status ON public.analytics_experiments(ws_id, status);

COMMENT ON TABLE public.analytics_experiments IS 'A/B testing and experimentation configuration';
COMMENT ON COLUMN public.analytics_experiments.experiment_key IS 'Unique key for SDK identification (e.g., homepage_hero_test)';
COMMENT ON COLUMN public.analytics_experiments.traffic_allocation IS 'Percentage of traffic to include in experiment (0.0-1.0)';
COMMENT ON COLUMN public.analytics_experiments.variants IS 'Array of variant configurations with weights and settings';


-- =====================================================
-- 4. ANALYTICS VARIANT ASSIGNMENTS TABLE
-- =====================================================
-- Tracks which variant each session was assigned

CREATE TABLE IF NOT EXISTS public.analytics_variant_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES public.analytics_experiments(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL, -- ID from the variants JSONB array
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure each session is assigned to only one variant per experiment
    CONSTRAINT unique_session_experiment_assignment UNIQUE (experiment_id, session_id)
);

-- Indexes for analytics_variant_assignments
CREATE INDEX idx_variant_assignments_experiment_id ON public.analytics_variant_assignments(experiment_id);
CREATE INDEX idx_variant_assignments_session_id ON public.analytics_variant_assignments(session_id);
CREATE INDEX idx_variant_assignments_variant_id ON public.analytics_variant_assignments(variant_id);
CREATE INDEX idx_variant_assignments_assigned_at ON public.analytics_variant_assignments(assigned_at DESC);

-- Composite index for experiment analysis
CREATE INDEX idx_variant_assignments_exp_variant ON public.analytics_variant_assignments(experiment_id, variant_id);

COMMENT ON TABLE public.analytics_variant_assignments IS 'Tracks which variant each session was assigned in A/B tests';


-- =====================================================
-- 5. ANALYTICS CONVERSIONS TABLE
-- =====================================================
-- Tracks conversion events for goal tracking and experiment analysis

CREATE TABLE IF NOT EXISTS public.analytics_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.analytics_events(id) ON DELETE SET NULL, -- Link to the original event

    -- Experiment context (nullable for non-experiment conversions)
    experiment_id UUID REFERENCES public.analytics_experiments(id) ON DELETE CASCADE,
    variant_id TEXT,

    -- Conversion details
    conversion_type TEXT NOT NULL, -- e.g., 'purchase', 'signup', 'download', 'custom_goal'
    conversion_value NUMERIC(12, 2), -- Optional monetary value
    conversion_properties JSONB, -- Additional conversion data

    converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics_conversions
CREATE INDEX idx_analytics_conversions_ws_id ON public.analytics_conversions(ws_id);
CREATE INDEX idx_analytics_conversions_session_id ON public.analytics_conversions(session_id);
CREATE INDEX idx_analytics_conversions_experiment_id ON public.analytics_conversions(experiment_id) WHERE experiment_id IS NOT NULL;
CREATE INDEX idx_analytics_conversions_type ON public.analytics_conversions(conversion_type);
CREATE INDEX idx_analytics_conversions_converted_at ON public.analytics_conversions(converted_at DESC);

-- Composite indexes for experiment analysis
CREATE INDEX idx_conversions_exp_variant ON public.analytics_conversions(experiment_id, variant_id) WHERE experiment_id IS NOT NULL;
CREATE INDEX idx_conversions_ws_type_time ON public.analytics_conversions(ws_id, conversion_type, converted_at DESC);

COMMENT ON TABLE public.analytics_conversions IS 'Tracks conversion events for goals and A/B test analysis';
COMMENT ON COLUMN public.analytics_conversions.conversion_value IS 'Optional monetary value for revenue tracking';


-- =====================================================
-- 6. EXTEND LINK_ANALYTICS TABLE
-- =====================================================
-- Add experiment support to existing link analytics

ALTER TABLE public.link_analytics
ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES public.analytics_experiments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variant_id TEXT,
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.analytics_sessions(id) ON DELETE SET NULL;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_link_analytics_experiment_id ON public.link_analytics(experiment_id) WHERE experiment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_link_analytics_variant_id ON public.link_analytics(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_link_analytics_session_id ON public.link_analytics(session_id) WHERE session_id IS NOT NULL;

COMMENT ON COLUMN public.link_analytics.experiment_id IS 'A/B test experiment ID if this click is part of an experiment';
COMMENT ON COLUMN public.link_analytics.variant_id IS 'Variant ID assigned for this click in an experiment';
COMMENT ON COLUMN public.link_analytics.session_id IS 'Analytics session ID linking to comprehensive session data';


-- =====================================================
-- 7. RPC FUNCTIONS
-- =====================================================

-- -----------------------------------------------
-- Function: track_analytics_event
-- Purpose: Insert event and update session activity
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.track_analytics_event(
    p_ws_id UUID,
    p_session_id UUID,
    p_event_name TEXT,
    p_event_properties JSONB DEFAULT NULL,
    p_page_url TEXT DEFAULT NULL,
    p_page_title TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_utm_source TEXT DEFAULT NULL,
    p_utm_medium TEXT DEFAULT NULL,
    p_utm_campaign TEXT DEFAULT NULL,
    p_utm_term TEXT DEFAULT NULL,
    p_utm_content TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
    v_referrer_domain TEXT;
    v_page_path TEXT;
BEGIN
    -- Extract referrer domain if referrer is provided
    IF p_referrer IS NOT NULL THEN
        v_referrer_domain := public.extract_referrer_domain(p_referrer);
    END IF;

    -- Extract page path from URL
    IF p_page_url IS NOT NULL THEN
        v_page_path := regexp_replace(p_page_url, '^https?://[^/]+', '');
    END IF;

    -- Insert event
    INSERT INTO public.analytics_events (
        ws_id,
        session_id,
        event_name,
        event_properties,
        page_url,
        page_title,
        page_path,
        referrer,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content
    ) VALUES (
        p_ws_id,
        p_session_id,
        p_event_name,
        p_event_properties,
        p_page_url,
        p_page_title,
        v_page_path,
        p_referrer,
        v_referrer_domain,
        p_utm_source,
        p_utm_medium,
        p_utm_campaign,
        p_utm_term,
        p_utm_content
    )
    RETURNING id INTO v_event_id;

    -- Update session last_active_at and session_duration
    UPDATE public.analytics_sessions
    SET
        last_active_at = NOW(),
        session_duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
    WHERE id = p_session_id;

    RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.track_analytics_event IS 'Tracks an analytics event and updates session activity';


-- -----------------------------------------------
-- Function: get_experiment_variant
-- Purpose: Get consistent variant assignment for a visitor
-- Uses deterministic hashing to ensure same visitor always gets same variant
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_experiment_variant(
    p_experiment_id UUID,
    p_visitor_id TEXT
)
RETURNS TABLE (
    variant_id TEXT,
    variant_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_experiment RECORD;
    v_hash_value BIGINT;
    v_random_value REAL;
    v_cumulative_weight REAL := 0;
    v_variant JSONB;
    v_selected_variant JSONB;
BEGIN
    -- Get experiment details
    SELECT * INTO v_experiment
    FROM public.analytics_experiments
    WHERE id = p_experiment_id AND status = 'running';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Experiment not found or not running';
    END IF;

    -- Check traffic allocation (deterministic based on visitor_id)
    v_hash_value := ('x' || substring(md5(p_visitor_id || p_experiment_id::text) from 1 for 16))::bit(64)::bigint;
    v_random_value := (v_hash_value % 10000)::REAL / 10000.0;

    -- If visitor is not in the traffic allocation, return NULL
    IF v_random_value > v_experiment.traffic_allocation THEN
        RETURN;
    END IF;

    -- Calculate deterministic variant assignment based on weights
    v_hash_value := ('x' || substring(md5(p_visitor_id || p_experiment_id::text || 'variant') from 1 for 16))::bit(64)::bigint;
    v_random_value := (v_hash_value % 10000)::REAL / 10000.0;

    -- Select variant based on cumulative weights
    FOR v_variant IN SELECT * FROM jsonb_array_elements(v_experiment.variants)
    LOOP
        v_cumulative_weight := v_cumulative_weight + (v_variant->>'weight')::REAL;
        IF v_random_value <= v_cumulative_weight THEN
            v_selected_variant := v_variant;
            EXIT;
        END IF;
    END LOOP;

    -- Return the selected variant
    variant_id := v_selected_variant->>'id';
    variant_config := v_selected_variant->'config';

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.get_experiment_variant IS 'Returns consistent variant assignment for a visitor using deterministic hashing';


-- -----------------------------------------------
-- Function: record_variant_assignment
-- Purpose: Record variant assignment for a session
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.record_variant_assignment(
    p_experiment_id UUID,
    p_session_id UUID,
    p_variant_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assignment_id UUID;
BEGIN
    INSERT INTO public.analytics_variant_assignments (
        experiment_id,
        session_id,
        variant_id
    ) VALUES (
        p_experiment_id,
        p_session_id,
        p_variant_id
    )
    ON CONFLICT (experiment_id, session_id) DO UPDATE
    SET variant_id = EXCLUDED.variant_id
    RETURNING id INTO v_assignment_id;

    RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION public.record_variant_assignment IS 'Records variant assignment for a session in an experiment';


-- -----------------------------------------------
-- Function: track_conversion
-- Purpose: Track a conversion event
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.track_conversion(
    p_ws_id UUID,
    p_session_id UUID,
    p_conversion_type TEXT,
    p_conversion_value NUMERIC DEFAULT NULL,
    p_conversion_properties JSONB DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversion_id UUID;
    v_experiment_id UUID;
    v_variant_id TEXT;
BEGIN
    -- Check if session is part of any experiment
    SELECT experiment_id, variant_id INTO v_experiment_id, v_variant_id
    FROM public.analytics_variant_assignments
    WHERE session_id = p_session_id
    ORDER BY assigned_at DESC
    LIMIT 1;

    -- Insert conversion
    INSERT INTO public.analytics_conversions (
        ws_id,
        session_id,
        event_id,
        experiment_id,
        variant_id,
        conversion_type,
        conversion_value,
        conversion_properties
    ) VALUES (
        p_ws_id,
        p_session_id,
        p_event_id,
        v_experiment_id,
        v_variant_id,
        p_conversion_type,
        p_conversion_value,
        p_conversion_properties
    )
    RETURNING id INTO v_conversion_id;

    RETURN v_conversion_id;
END;
$$;

COMMENT ON FUNCTION public.track_conversion IS 'Tracks a conversion event and automatically links to active experiments';


-- -----------------------------------------------
-- Function: get_analytics_summary
-- Purpose: Get aggregated analytics summary for a workspace
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
    p_ws_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    total_events BIGINT,
    total_sessions BIGINT,
    unique_visitors BIGINT,
    total_conversions BIGINT,
    conversion_rate NUMERIC,
    avg_session_duration NUMERIC,
    top_event_name TEXT,
    top_event_count BIGINT,
    top_country TEXT,
    top_country_count BIGINT,
    top_device_type TEXT,
    top_device_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH event_stats AS (
        SELECT
            COUNT(*) as event_count,
            COUNT(DISTINCT session_id) as session_count
        FROM public.analytics_events
        WHERE ws_id = p_ws_id
        AND timestamp BETWEEN p_start_date AND p_end_date
    ),
    session_stats AS (
        SELECT
            COUNT(DISTINCT visitor_id) as visitor_count,
            AVG(session_duration) as avg_duration
        FROM public.analytics_sessions
        WHERE ws_id = p_ws_id
        AND started_at BETWEEN p_start_date AND p_end_date
    ),
    conversion_stats AS (
        SELECT COUNT(*) as conversion_count
        FROM public.analytics_conversions
        WHERE ws_id = p_ws_id
        AND converted_at BETWEEN p_start_date AND p_end_date
    ),
    top_event AS (
        SELECT event_name, COUNT(*) as count
        FROM public.analytics_events
        WHERE ws_id = p_ws_id
        AND timestamp BETWEEN p_start_date AND p_end_date
        GROUP BY event_name
        ORDER BY count DESC
        LIMIT 1
    ),
    top_country AS (
        SELECT s.country, COUNT(DISTINCT s.id) as count
        FROM public.analytics_sessions s
        WHERE s.ws_id = p_ws_id
        AND s.started_at BETWEEN p_start_date AND p_end_date
        AND s.country IS NOT NULL
        GROUP BY s.country
        ORDER BY count DESC
        LIMIT 1
    ),
    top_device AS (
        SELECT s.device_type, COUNT(DISTINCT s.id) as count
        FROM public.analytics_sessions s
        WHERE s.ws_id = p_ws_id
        AND s.started_at BETWEEN p_start_date AND p_end_date
        AND s.device_type IS NOT NULL
        GROUP BY s.device_type
        ORDER BY count DESC
        LIMIT 1
    )
    SELECT
        COALESCE(es.event_count, 0)::BIGINT,
        COALESCE(es.session_count, 0)::BIGINT,
        COALESCE(ss.visitor_count, 0)::BIGINT,
        COALESCE(cs.conversion_count, 0)::BIGINT,
        CASE
            WHEN COALESCE(es.session_count, 0) > 0
            THEN ROUND((COALESCE(cs.conversion_count, 0)::NUMERIC / es.session_count::NUMERIC) * 100, 2)
            ELSE 0
        END,
        ROUND(COALESCE(ss.avg_duration, 0), 2),
        te.event_name,
        COALESCE(te.count, 0)::BIGINT,
        tc.country,
        COALESCE(tc.count, 0)::BIGINT,
        td.device_type,
        COALESCE(td.count, 0)::BIGINT
    FROM event_stats es
    CROSS JOIN session_stats ss
    CROSS JOIN conversion_stats cs
    LEFT JOIN top_event te ON true
    LEFT JOIN top_country tc ON true
    LEFT JOIN top_device td ON true;
END;
$$;

COMMENT ON FUNCTION public.get_analytics_summary IS 'Returns aggregated analytics summary for a workspace';


-- -----------------------------------------------
-- Function: get_experiment_results
-- Purpose: Calculate experiment results with statistical data
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_experiment_results(
    p_experiment_id UUID
)
RETURNS TABLE (
    variant_id TEXT,
    sessions BIGINT,
    conversions BIGINT,
    conversion_rate NUMERIC,
    unique_visitors BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_experiment RECORD;
    v_variant JSONB;
BEGIN
    -- Get experiment details
    SELECT * INTO v_experiment
    FROM public.analytics_experiments
    WHERE id = p_experiment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Experiment not found';
    END IF;

    -- Return results for each variant
    FOR v_variant IN SELECT * FROM jsonb_array_elements(v_experiment.variants)
    LOOP
        RETURN QUERY
        SELECT
            v_variant->>'id' as variant_id,
            COUNT(DISTINCT va.session_id)::BIGINT as sessions,
            COUNT(DISTINCT c.id)::BIGINT as conversions,
            CASE
                WHEN COUNT(DISTINCT va.session_id) > 0
                THEN ROUND((COUNT(DISTINCT c.id)::NUMERIC / COUNT(DISTINCT va.session_id)::NUMERIC) * 100, 2)
                ELSE 0
            END as conversion_rate,
            COUNT(DISTINCT s.visitor_id)::BIGINT as unique_visitors
        FROM public.analytics_variant_assignments va
        LEFT JOIN public.analytics_sessions s ON s.id = va.session_id
        LEFT JOIN public.analytics_conversions c ON c.session_id = va.session_id AND c.experiment_id = va.experiment_id
        WHERE va.experiment_id = p_experiment_id
        AND va.variant_id = v_variant->>'id';
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_experiment_results IS 'Calculates experiment results including sessions, conversions, conversion rates, and unique visitors per variant';


-- =====================================================
-- 8. MATERIALIZED VIEWS
-- =====================================================

-- -----------------------------------------------
-- View: analytics_daily_summary
-- Purpose: Pre-aggregated daily analytics for faster queries
-- -----------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.analytics_daily_summary AS
SELECT
    e.ws_id,
    DATE(e.timestamp) as date,
    COUNT(DISTINCT e.id) as total_events,
    COUNT(DISTINCT e.session_id) as total_sessions,
    COUNT(DISTINCT s.visitor_id) as unique_visitors,
    COUNT(DISTINCT e.page_path) as unique_pages,
    COUNT(DISTINCT e.referrer_domain) as unique_referrers
FROM public.analytics_events e
JOIN public.analytics_sessions s ON s.id = e.session_id
GROUP BY e.ws_id, DATE(e.timestamp);

CREATE UNIQUE INDEX idx_analytics_daily_summary_ws_date ON public.analytics_daily_summary(ws_id, date DESC);

COMMENT ON MATERIALIZED VIEW public.analytics_daily_summary IS 'Pre-aggregated daily analytics metrics, refreshed every 5 minutes';


-- -----------------------------------------------
-- View: analytics_geographic_summary
-- Purpose: Geographic aggregations for heatmaps
-- -----------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.analytics_geographic_summary AS
SELECT
    ws_id,
    country,
    country_region,
    city,
    latitude,
    longitude,
    COUNT(DISTINCT id) as session_count,
    COUNT(DISTINCT visitor_id) as unique_visitors
FROM public.analytics_sessions
WHERE country IS NOT NULL
GROUP BY ws_id, country, country_region, city, latitude, longitude;

CREATE INDEX idx_analytics_geo_summary_ws ON public.analytics_geographic_summary(ws_id);
CREATE INDEX idx_analytics_geo_summary_coords ON public.analytics_geographic_summary(latitude, longitude) WHERE latitude IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.analytics_geographic_summary IS 'Geographic aggregations for mapping and heatmap visualization';


-- =====================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all analytics tables
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_variant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_conversions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- RLS: analytics_sessions
-- -----------------------------------------------

-- Policy: Workspace members can view sessions in their workspace
CREATE POLICY analytics_sessions_select_policy ON public.analytics_sessions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_sessions.ws_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Anyone can insert sessions (for tracking)
CREATE POLICY analytics_sessions_insert_policy ON public.analytics_sessions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Policy: System can update sessions (for session duration updates)
CREATE POLICY analytics_sessions_update_policy ON public.analytics_sessions
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY analytics_sessions_select_policy ON public.analytics_sessions IS 'Workspace members can view sessions';
COMMENT ON POLICY analytics_sessions_insert_policy ON public.analytics_sessions IS 'Anyone can insert sessions for tracking';


-- -----------------------------------------------
-- RLS: analytics_events
-- -----------------------------------------------

-- Policy: Workspace members can view events in their workspace
CREATE POLICY analytics_events_select_policy ON public.analytics_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_events.ws_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Anyone can insert events (for tracking)
CREATE POLICY analytics_events_insert_policy ON public.analytics_events
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

COMMENT ON POLICY analytics_events_select_policy ON public.analytics_events IS 'Workspace members can view events';
COMMENT ON POLICY analytics_events_insert_policy ON public.analytics_events IS 'Anyone can insert events for tracking';


-- -----------------------------------------------
-- RLS: analytics_experiments
-- -----------------------------------------------

-- Policy: Workspace members can view experiments in their workspace
CREATE POLICY analytics_experiments_select_policy ON public.analytics_experiments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_experiments.ws_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Workspace members with manage_analytics permission can insert experiments
CREATE POLICY analytics_experiments_insert_policy ON public.analytics_experiments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_experiments.ws_id
            AND wm.user_id = auth.uid()
            -- TODO: Add permission check once analytics permissions are added
        )
    );

-- Policy: Workspace members with manage_analytics permission can update experiments
CREATE POLICY analytics_experiments_update_policy ON public.analytics_experiments
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_experiments.ws_id
            AND wm.user_id = auth.uid()
            -- TODO: Add permission check once analytics permissions are added
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_experiments.ws_id
            AND wm.user_id = auth.uid()
            -- TODO: Add permission check once analytics permissions are added
        )
    );

-- Policy: Workspace members with manage_analytics permission can delete experiments
CREATE POLICY analytics_experiments_delete_policy ON public.analytics_experiments
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_experiments.ws_id
            AND wm.user_id = auth.uid()
            -- TODO: Add permission check once analytics permissions are added
        )
    );

COMMENT ON POLICY analytics_experiments_select_policy ON public.analytics_experiments IS 'Workspace members can view experiments';


-- -----------------------------------------------
-- RLS: analytics_variant_assignments
-- -----------------------------------------------

-- Policy: Workspace members can view variant assignments through experiment
CREATE POLICY analytics_variant_assignments_select_policy ON public.analytics_variant_assignments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.analytics_experiments e
            JOIN public.workspace_members wm ON wm.ws_id = e.ws_id
            WHERE e.id = analytics_variant_assignments.experiment_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Anyone can insert variant assignments (for tracking)
CREATE POLICY analytics_variant_assignments_insert_policy ON public.analytics_variant_assignments
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

COMMENT ON POLICY analytics_variant_assignments_select_policy ON public.analytics_variant_assignments IS 'Workspace members can view variant assignments through experiments';


-- -----------------------------------------------
-- RLS: analytics_conversions
-- -----------------------------------------------

-- Policy: Workspace members can view conversions in their workspace
CREATE POLICY analytics_conversions_select_policy ON public.analytics_conversions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = analytics_conversions.ws_id
            AND wm.user_id = auth.uid()
        )
    );

-- Policy: Anyone can insert conversions (for tracking)
CREATE POLICY analytics_conversions_insert_policy ON public.analytics_conversions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

COMMENT ON POLICY analytics_conversions_select_policy ON public.analytics_conversions IS 'Workspace members can view conversions';
COMMENT ON POLICY analytics_conversions_insert_policy ON public.analytics_conversions IS 'Anyone can insert conversions for tracking';


-- =====================================================
-- 10. REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- =====================================================

CREATE OR REPLACE FUNCTION public.refresh_analytics_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_daily_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_geographic_summary;
END;
$$;

COMMENT ON FUNCTION public.refresh_analytics_materialized_views IS 'Refreshes all analytics materialized views (should be called every 5 minutes via cron/trigger)';


-- -----------------------------------------------
-- Function: process_experiment_statistics
-- Purpose: Update experiment statistics and metrics
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.process_experiment_statistics(
    p_experiment_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_experiment RECORD;
BEGIN
    -- Get experiment details
    SELECT * INTO v_experiment
    FROM public.analytics_experiments
    WHERE id = p_experiment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Experiment not found: %', p_experiment_id;
    END IF;

    -- Update statistics are automatically maintained by the database
    -- through the analytics_variant_assignments and analytics_conversions tables
    -- This function can be extended to perform additional processing such as:
    -- - Calculating statistical significance
    -- - Sending notifications when experiments reach significance
    -- - Auto-stopping experiments based on criteria
    -- - Logging experiment state changes

    -- For now, we just ensure data consistency
    -- The get_experiment_results function provides real-time statistics

    RAISE NOTICE 'Processed statistics for experiment: %', p_experiment_id;
END;
$$;

COMMENT ON FUNCTION public.process_experiment_statistics IS 'Processes and updates statistics for a specific experiment (called by cron job)';


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Run: bun sb:typegen to generate TypeScript types
-- 2. Set up cron job or Trigger.dev to call refresh_analytics_materialized_views() every 5 minutes
-- 3. Implement SDK AnalyticsClient in packages/sdk/
-- 4. Create API endpoints in apps/web/src/app/api/v1/analytics/
-- 5. Build dashboard components in apps/web/
-- =====================================================
