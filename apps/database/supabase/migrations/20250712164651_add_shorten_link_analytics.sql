-- Create link_analytics table for tracking shortened link clicks
create table "public"."link_analytics" (
  "id" uuid not null default gen_random_uuid(),
  "link_id" uuid not null,
  "ip_address" inet,
  "user_agent" text,
  "referrer" text,
  "referrer_domain" text,
  "country" text,
  "city" text,
  "clicked_at" timestamp with time zone not null default now(),
  "created_at" timestamp with time zone not null default now()
);

-- Enable RLS
alter table "public"."link_analytics" enable row level security;

-- Create indexes for performance
CREATE INDEX link_analytics_link_id_idx ON public.link_analytics USING btree (link_id);
CREATE INDEX link_analytics_clicked_at_idx ON public.link_analytics USING btree (clicked_at);
CREATE INDEX link_analytics_referrer_domain_idx ON public.link_analytics USING btree (referrer_domain);
CREATE INDEX link_analytics_country_idx ON public.link_analytics USING btree (country);

-- Create primary key
CREATE UNIQUE INDEX link_analytics_pkey ON public.link_analytics USING btree (id);
alter table "public"."link_analytics" add constraint "link_analytics_pkey" PRIMARY KEY using index "link_analytics_pkey";

-- Create foreign key constraint
alter table "public"."link_analytics" add constraint "link_analytics_link_id_fkey" FOREIGN KEY (link_id) REFERENCES shortened_links(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."link_analytics" validate constraint "link_analytics_link_id_fkey";

-- Create function to extract referrer domain
CREATE OR REPLACE FUNCTION extract_referrer_domain(url TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Handle various referrer formats and extract the domain
  RETURN CASE
    WHEN url IS NULL OR url = '' THEN NULL
    WHEN url ~ '^https?://' THEN 
      -- Extract domain from full URL
      REGEXP_REPLACE(
        REGEXP_REPLACE(url, '^https?://', ''),
        '/.*$', ''
      )
    WHEN url ~ '^//' THEN 
      -- Handle protocol-relative URLs
      REGEXP_REPLACE(
        REGEXP_REPLACE(url, '^//', ''),
        '/.*$', ''
      )
    ELSE 
      -- If it's already a domain or malformed, try to clean it
      REGEXP_REPLACE(url, '/.*$', '')
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger function to set referrer domain
CREATE OR REPLACE FUNCTION set_referrer_domain()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referrer_domain := extract_referrer_domain(NEW.referrer);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for insert and update
CREATE TRIGGER trg_set_referrer_domain
BEFORE INSERT OR UPDATE OF referrer
ON link_analytics
FOR EACH ROW
EXECUTE FUNCTION set_referrer_domain();

-- Grant permissions to authenticated users
grant select on table "public"."link_analytics" to "authenticated";
grant insert on table "public"."link_analytics" to "authenticated";
grant update on table "public"."link_analytics" to "authenticated";
grant delete on table "public"."link_analytics" to "authenticated";

-- Grant permissions to anon users for click tracking
grant insert on table "public"."link_analytics" to "anon";

-- Grant permissions to service role
grant all on table "public"."link_analytics" to "service_role";

-- Create RLS policies
-- Allow authenticated users to view analytics for their workspace links
CREATE POLICY "Allow authenticated users to view analytics for workspace links" ON "public"."link_analytics"
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM shortened_links sl
    JOIN workspace_members wm ON sl.ws_id = wm.ws_id
    WHERE sl.id = link_analytics.link_id
    AND wm.user_id = auth.uid()
  )
);

-- Allow anyone to insert analytics (for click tracking)
CREATE POLICY "Allow anyone to insert analytics" ON "public"."link_analytics"
FOR INSERT
WITH CHECK (true);

-- Create a view for aggregated analytics
CREATE OR REPLACE VIEW link_analytics_summary AS
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
  MIN(la.clicked_at) as first_click_at,
  MAX(la.clicked_at) as last_click_at,
  -- Top referrer domain
  MODE() WITHIN GROUP (ORDER BY la.referrer_domain) as top_referrer_domain,
  -- Top country
  MODE() WITHIN GROUP (ORDER BY la.country) as top_country
FROM shortened_links sl
LEFT JOIN link_analytics la ON sl.id = la.link_id
GROUP BY sl.id, sl.slug, sl.link, sl.domain, sl.creator_id, sl.ws_id, sl.created_at;

-- Grant permissions on the view
grant select on "public"."link_analytics_summary" to "authenticated";
grant select on "public"."link_analytics_summary" to "service_role";

-- Note: RLS policies cannot be applied to views, only to tables
-- The view will inherit security from the underlying tables (shortened_links and link_analytics)

drop policy "Allow anyone to insert analytics" on "public"."link_analytics";