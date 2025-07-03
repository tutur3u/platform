-- Create a function to extract domain from URL
CREATE OR REPLACE FUNCTION extract_domain(url TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Handle various URL formats and extract the domain
  RETURN CASE
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

-- Create a view for domain statistics
CREATE OR REPLACE VIEW shortened_links_domain_stats AS
SELECT 
  extract_domain(link) as domain,
  COUNT(*) as link_count,
  COUNT(DISTINCT creator_id) as creator_count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM shortened_links 
WHERE link IS NOT NULL 
  AND link != ''
  AND extract_domain(link) IS NOT NULL
  AND extract_domain(link) != ''
GROUP BY extract_domain(link)
ORDER BY link_count DESC;

-- Create a view for creator statistics  
CREATE OR REPLACE VIEW shortened_links_creator_stats AS
SELECT 
  u.id,
  u.display_name,
  u.avatar_url,
  upd.email,
  COUNT(sl.id) as link_count,
  COUNT(DISTINCT extract_domain(sl.link)) as domain_count,
  MIN(sl.created_at) as first_link_created,
  MAX(sl.created_at) as last_link_created
FROM users u
LEFT JOIN user_private_details upd ON u.id = upd.user_id
INNER JOIN shortened_links sl ON u.id = sl.creator_id
WHERE sl.link IS NOT NULL
GROUP BY u.id, u.display_name, u.avatar_url, upd.email
ORDER BY link_count DESC;

-- Add an index on the extracted domain for better performance
CREATE INDEX IF NOT EXISTS idx_shortened_links_domain 
ON shortened_links (extract_domain(link)) 
WHERE link IS NOT NULL AND link != '';

-- Add an index on creator_id for better join performance
CREATE INDEX IF NOT EXISTS idx_shortened_links_creator_id 
ON shortened_links (creator_id) 
WHERE creator_id IS NOT NULL;
