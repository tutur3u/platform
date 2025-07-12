-- Enhanced analytics tracking for shortened links
-- Add new columns to capture Vercel geolocation and device data

-- Add new columns to link_analytics table
ALTER TABLE "public"."link_analytics" 
ADD COLUMN IF NOT EXISTS "country_region" text,
ADD COLUMN IF NOT EXISTS "latitude" real,
ADD COLUMN IF NOT EXISTS "longitude" real,
ADD COLUMN IF NOT EXISTS "timezone" text,
ADD COLUMN IF NOT EXISTS "postal_code" text,
ADD COLUMN IF NOT EXISTS "vercel_region" text,
ADD COLUMN IF NOT EXISTS "vercel_id" text,
ADD COLUMN IF NOT EXISTS "device_type" text,
ADD COLUMN IF NOT EXISTS "browser" text,
ADD COLUMN IF NOT EXISTS "os" text;

-- Create additional indexes for performance
CREATE INDEX IF NOT EXISTS link_analytics_city_idx ON public.link_analytics USING btree (city);
CREATE INDEX IF NOT EXISTS link_analytics_vercel_region_idx ON public.link_analytics USING btree (vercel_region);
CREATE INDEX IF NOT EXISTS link_analytics_device_type_idx ON public.link_analytics USING btree (device_type);
CREATE INDEX IF NOT EXISTS link_analytics_browser_idx ON public.link_analytics USING btree (browser);
CREATE INDEX IF NOT EXISTS link_analytics_os_idx ON public.link_analytics USING btree (os);

-- Create function to parse user agent for device type, browser, and OS
CREATE OR REPLACE FUNCTION parse_user_agent(user_agent TEXT)
RETURNS TABLE(device_type TEXT, browser TEXT, os TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN user_agent ~* 'mobile|android|iphone|ipad|ipod|blackberry|windows phone' THEN 'mobile'
      WHEN user_agent ~* 'tablet|ipad' THEN 'tablet'
      ELSE 'desktop'
    END as device_type,
    CASE
      WHEN user_agent ~* 'chrome' THEN 'Chrome'
      WHEN user_agent ~* 'firefox' THEN 'Firefox'
      WHEN user_agent ~* 'safari' THEN 'Safari'
      WHEN user_agent ~* 'edge' THEN 'Edge'
      WHEN user_agent ~* 'opera' THEN 'Opera'
      ELSE 'Other'
    END as browser,
    CASE
      WHEN user_agent ~* 'windows' THEN 'Windows'
      WHEN user_agent ~* 'macintosh|mac os x' THEN 'macOS'
      WHEN user_agent ~* 'linux' THEN 'Linux'
      WHEN user_agent ~* 'android' THEN 'Android'
      WHEN user_agent ~* 'iphone|ipad|ipod' THEN 'iOS'
      ELSE 'Other'
    END as os;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing trigger function to handle new fields
CREATE OR REPLACE FUNCTION set_analytics_metadata()
RETURNS TRIGGER AS $$
DECLARE
  parsed_ua RECORD;
BEGIN
  -- Set referrer domain (existing functionality)
  NEW.referrer_domain := extract_referrer_domain(NEW.referrer);
  
  -- Parse user agent to extract device info
  IF NEW.user_agent IS NOT NULL THEN
    SELECT * INTO parsed_ua FROM parse_user_agent(NEW.user_agent);
    NEW.device_type := parsed_ua.device_type;
    NEW.browser := parsed_ua.browser;
    NEW.os := parsed_ua.os;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger with updated function
DROP TRIGGER IF EXISTS trg_set_referrer_domain ON link_analytics;
DROP TRIGGER IF EXISTS trg_set_analytics_metadata ON link_analytics;

CREATE TRIGGER trg_set_analytics_metadata
BEFORE INSERT OR UPDATE OF referrer, user_agent
ON link_analytics
FOR EACH ROW
EXECUTE FUNCTION set_analytics_metadata();

-- Drop the existing view first to avoid column naming conflicts
DROP VIEW IF EXISTS link_analytics_summary;

-- Create the analytics summary view with new fields
CREATE VIEW link_analytics_summary AS
SELECT 
  sl.id as link_id,
  sl.slug,
  sl.link as original_url,
  sl.domain,
  sl.creator_id,
  sl.ws_id,
  sl.created_at as link_created_at,
  COUNT(la.id) as total_clicks,
  COUNT(DISTINCT la.ip_address) as unique_visitors,
  COUNT(DISTINCT la.referrer_domain) as unique_referrers,
  COUNT(DISTINCT la.country) as unique_countries,
  COUNT(DISTINCT la.city) as unique_cities,
  COUNT(DISTINCT la.device_type) as unique_device_types,
  COUNT(DISTINCT la.browser) as unique_browsers,
  COUNT(DISTINCT la.os) as unique_operating_systems,
  MIN(la.clicked_at) as first_click_at,
  MAX(la.clicked_at) as last_click_at,
  -- Top referrer domain
  MODE() WITHIN GROUP (ORDER BY la.referrer_domain) as top_referrer_domain,
  -- Top country
  MODE() WITHIN GROUP (ORDER BY la.country) as top_country,
  -- Top city
  MODE() WITHIN GROUP (ORDER BY la.city) as top_city,
  -- Top device type
  MODE() WITHIN GROUP (ORDER BY la.device_type) as top_device_type,
  -- Top browser
  MODE() WITHIN GROUP (ORDER BY la.browser) as top_browser,
  -- Top OS
  MODE() WITHIN GROUP (ORDER BY la.os) as top_os,
  -- Top Vercel region
  MODE() WITHIN GROUP (ORDER BY la.vercel_region) as top_vercel_region
FROM shortened_links sl
LEFT JOIN link_analytics la ON sl.id = la.link_id
GROUP BY sl.id, sl.slug, sl.link, sl.domain, sl.creator_id, sl.ws_id, sl.created_at;

-- Create a new view for geolocation insights
CREATE OR REPLACE VIEW link_analytics_geo_insights AS
SELECT 
  sl.id as link_id,
  sl.slug,
  sl.domain,
  la.country,
  la.country_region,
  la.city,
  la.latitude,
  la.longitude,
  la.timezone,
  la.postal_code,
  la.vercel_region,
  COUNT(*) as click_count,
  COUNT(DISTINCT la.ip_address) as unique_visitors,
  MIN(la.clicked_at) as first_click_at,
  MAX(la.clicked_at) as last_click_at
FROM shortened_links sl
INNER JOIN link_analytics la ON sl.id = la.link_id
WHERE la.country IS NOT NULL
GROUP BY sl.id, sl.slug, sl.domain, la.country, la.country_region, la.city, 
         la.latitude, la.longitude, la.timezone, la.postal_code, la.vercel_region
ORDER BY click_count DESC;

-- Grant permissions on the new view
grant select on "public"."link_analytics_geo_insights" to "authenticated";
grant select on "public"."link_analytics_geo_insights" to "service_role";

-- Create a view for device analytics
CREATE OR REPLACE VIEW link_analytics_device_insights AS
SELECT 
  sl.id as link_id,
  sl.slug,
  sl.domain,
  la.device_type,
  la.browser,
  la.os,
  COUNT(*) as click_count,
  COUNT(DISTINCT la.ip_address) as unique_visitors,
  MIN(la.clicked_at) as first_click_at,
  MAX(la.clicked_at) as last_click_at
FROM shortened_links sl
INNER JOIN link_analytics la ON sl.id = la.link_id
WHERE la.device_type IS NOT NULL
GROUP BY sl.id, sl.slug, sl.domain, la.device_type, la.browser, la.os
ORDER BY click_count DESC;

-- Grant permissions on the device insights view
grant select on "public"."link_analytics_device_insights" to "authenticated";
grant select on "public"."link_analytics_device_insights" to "service_role";

-- Create RPC function for efficient clicks by day aggregation
CREATE OR REPLACE FUNCTION get_clicks_by_day(p_link_id uuid, p_days int DEFAULT 30)
RETURNS TABLE(click_date date, clicks bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT date_trunc('day', la.clicked_at)::date, COUNT(*)
  FROM public.link_analytics la
  WHERE la.link_id = p_link_id AND la.clicked_at >= now() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1 DESC;
END; $$ LANGUAGE plpgsql;

-- Create RPC function for efficient top referrers aggregation
CREATE OR REPLACE FUNCTION get_top_referrers(p_link_id uuid, p_limit int DEFAULT 10)
RETURNS TABLE(domain text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(la.referrer_domain, 'Direct') as domain, COUNT(*) as click_count
  FROM public.link_analytics la
  WHERE la.link_id = p_link_id
  GROUP BY la.referrer_domain
  ORDER BY click_count DESC
  LIMIT p_limit;
END; $$ LANGUAGE plpgsql;

-- Create RPC function for efficient top countries aggregation
CREATE OR REPLACE FUNCTION get_top_countries(p_link_id uuid, p_limit int DEFAULT 10)
RETURNS TABLE(country text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(la.country, 'Unknown') as country, COUNT(*) as click_count
  FROM public.link_analytics la
  WHERE la.link_id = p_link_id
  GROUP BY la.country
  ORDER BY click_count DESC
  LIMIT p_limit;
END; $$ LANGUAGE plpgsql;

-- Create view for workspace link counts (for efficient filtering)
CREATE OR REPLACE VIEW workspace_link_counts AS
SELECT
  ws.id,
  ws.name,
  ws.logo_url,
  COUNT(sl.id) as link_count
FROM workspaces ws
LEFT JOIN shortened_links sl ON ws.id = sl.ws_id
GROUP BY ws.id, ws.name, ws.logo_url;

-- Grant permissions on the workspace link counts view
grant select on "public"."workspace_link_counts" to "authenticated";
grant select on "public"."workspace_link_counts" to "service_role";

-- Grant permissions on the RPC functions
grant execute on function "public"."get_clicks_by_day" to "authenticated";
grant execute on function "public"."get_clicks_by_day" to "service_role";
grant execute on function "public"."get_top_referrers" to "authenticated";
grant execute on function "public"."get_top_referrers" to "service_role";
grant execute on function "public"."get_top_countries" to "authenticated";
grant execute on function "public"."get_top_countries" to "service_role";