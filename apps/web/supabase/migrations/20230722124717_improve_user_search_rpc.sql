-- Drop old function
DROP FUNCTION IF EXISTS public.search_users_by_name(varchar);
-- Drop the expression index for similarity
DROP INDEX IF EXISTS idx_users_search;
-- Drop the trigram index
DROP INDEX IF EXISTS idx_trgm_users_search_fields;
-- Drop the custom text search configuration (it will only be dropped if there are no dependent objects)
DROP TEXT SEARCH CONFIGURATION IF EXISTS vietnamese_config;
-- Install pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Create custom text search configuration for Vietnamese
CREATE TEXT SEARCH CONFIGURATION vietnamese_config (COPY = pg_catalog.simple);
ALTER TEXT SEARCH CONFIGURATION vietnamese_config ALTER MAPPING FOR hword,
hword_part,
word WITH simple;
-- Create the trigram index with the custom text search configuration
CREATE INDEX IF NOT EXISTS idx_trgm_users_search_fields ON users USING gin (
    (
        to_tsvector('vietnamese_config', coalesce(handle, '')) || to_tsvector('vietnamese_config', coalesce(display_name, ''))
    )
);
-- Create the expression index for similarity
CREATE INDEX IF NOT EXISTS idx_users_search ON users (similarity(handle, 'query'));
-- Create the optimized search function
CREATE OR REPLACE FUNCTION public.search_users_by_name (
        search_query text,
        result_limit integer = 5,
        min_similarity double precision = 0.3
    ) RETURNS TABLE (
        id uuid,
        handle text,
        display_name text,
        avatar_url text,
        relevance double precision
    ) LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY
SELECT u.id,
    u.handle,
    u.display_name,
    u.avatar_url,
    GREATEST(
        similarity(u.handle, search_query),
        similarity(u.display_name, search_query)
    )::double precision AS relevance
FROM users u
WHERE u.deleted = false
    AND (
        similarity(u.handle, search_query) >= min_similarity
        OR similarity(u.display_name, search_query) >= min_similarity
    )
ORDER BY GREATEST(
        similarity(u.handle, search_query),
        similarity(u.display_name, search_query)
    ) DESC,
    u.created_at
LIMIT result_limit;
END;
$$;