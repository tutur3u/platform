CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_workspace_user_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(
    regexp_replace(
      replace(lower(extensions.unaccent(coalesce(input, ''))), 'đ', 'd'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE INDEX IF NOT EXISTS workspace_users_normalized_search_trgm_idx
ON public.workspace_users
USING gin (
  public.normalize_workspace_user_search_text(
    coalesce(full_name, '') || ' ' ||
    coalesce(display_name, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, '')
  ) gin_trgm_ops
);

CREATE OR REPLACE FUNCTION public.get_workspace_users(
    _ws_id UUID,
    included_groups UUID[],
    excluded_groups UUID[],
    search_query TEXT,
    include_archived BOOLEAN DEFAULT FALSE,
    link_status TEXT DEFAULT 'all'
)
RETURNS TABLE (
    id UUID,
    avatar_url TEXT,
    full_name TEXT,
    display_name TEXT,
    email TEXT,
    phone TEXT,
    gender TEXT,
    birthday DATE,
    ethnicity TEXT,
    guardian TEXT,
    address TEXT,
    national_id TEXT,
    note TEXT,
    balance BIGINT,
    ws_id UUID,
    groups UUID[],
    group_count BIGINT,
    linked_users json,
    archived BOOLEAN,
    archived_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    normalized_search_query TEXT := public.normalize_workspace_user_search_text(search_query);
    normalized_search_pattern TEXT := '%' || replace(normalized_search_query, ' ', '%') || '%';
BEGIN
    RETURN QUERY
    SELECT
        wu.id,
        wu.avatar_url,
        wu.full_name,
        wu.display_name,
        wu.email,
        wu.phone,
        wu.gender,
        wu.birthday,
        wu.ethnicity,
        wu.guardian,
        wu.address,
        wu.national_id,
        wu.note,
        wu.balance,
        wu.ws_id,
        ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) AS groups,
        wu.group_count,
        wu.linked_users,
        wu.archived,
        wu.archived_until,
        wu.created_at,
        wu.updated_at
    FROM workspace_users_with_groups wu
    WHERE wu.ws_id = _ws_id
    AND (
        normalized_search_query = ''
        OR public.normalize_workspace_user_search_text(
            coalesce(wu.full_name, '') || ' ' ||
            coalesce(wu.display_name, '') || ' ' ||
            coalesce(wu.email, '') || ' ' ||
            coalesce(wu.phone, '')
        ) LIKE normalized_search_pattern
    )
    AND (
        (included_groups IS NULL OR included_groups = ARRAY[]::uuid[] OR ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && included_groups)
        AND (excluded_groups IS NULL OR excluded_groups = ARRAY[]::uuid[] OR NOT (ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && excluded_groups))
    )
    AND (include_archived = TRUE OR wu.archived IS NOT TRUE)
    AND (
        link_status = 'all'
        OR (link_status = 'linked' AND wu.linked_users IS NOT NULL)
        OR (link_status = 'virtual' AND wu.linked_users IS NULL)
    );
END; $$
LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_workspace_users(UUID, UUID[], UUID[], TEXT, BOOLEAN, TEXT) IS
'Fetches workspace users with group, archive, and link filters.
Search is accent-insensitive across full_name, display_name, email, and phone,
and normalizes Vietnamese characters such as đ -> d.';
