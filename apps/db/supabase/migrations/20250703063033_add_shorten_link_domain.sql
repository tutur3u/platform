-- Add domain column if it doesn't exist
ALTER TABLE shortened_links ADD COLUMN IF NOT EXISTS domain TEXT;

-- Backfill domain for existing rows (improved extraction)
UPDATE shortened_links
SET domain = regexp_replace(regexp_replace(link, '^https?://|^//', ''), '/.*$', '')
WHERE link IS NOT NULL AND (domain IS NULL OR domain = '');

-- Optional: Create an index for faster filtering
CREATE INDEX IF NOT EXISTS shortened_links_domain_idx ON shortened_links(domain);

-- Trigger function to always set domain from link
CREATE OR REPLACE FUNCTION set_shortened_links_domain()
RETURNS TRIGGER AS $$
BEGIN
  NEW.domain := regexp_replace(regexp_replace(NEW.link, '^https?://|^//', ''), '/.*$', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_set_shortened_links_domain ON shortened_links;

-- Create trigger for insert and update
CREATE TRIGGER trg_set_shortened_links_domain
BEFORE INSERT OR UPDATE OF link
ON shortened_links
FOR EACH ROW
EXECUTE FUNCTION set_shortened_links_domain();
