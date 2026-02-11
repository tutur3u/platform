-- Add link_status parameter to get_workspace_users RPC function
-- This allows filtering workspace users by their platform link status:
-- - 'all': No filtering (default)
-- - 'linked': Only users with at least one linked platform user
-- - 'virtual': Only users with no linked platform users (virtual-only)
--
-- The linked_users column from workspace_users_with_groups view uses json_agg()
-- which returns NULL when there are no linked users, so we check for NULL/NOT NULL.

-- Drop existing function (with all parameter combinations)
DROP FUNCTION IF EXISTS get_workspace_users(UUID, UUID[], UUID[], TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS get_workspace_users(UUID, UUID[], UUID[], TEXT);

-- Recreate function with link_status parameter
CREATE FUNCTION get_workspace_users(
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
        search_query IS NULL 
        OR search_query = '' 
        OR COALESCE(wu.full_name, '') ILIKE '%' || search_query || '%' 
        OR COALESCE(wu.display_name, '') ILIKE '%' || search_query || '%' 
        OR COALESCE(wu.email, '') ILIKE '%' || search_query || '%'
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

-- Add comment for documentation
COMMENT ON FUNCTION get_workspace_users(UUID, UUID[], UUID[], TEXT, BOOLEAN, TEXT) IS 
'Fetches workspace users with filtering support.
Parameters:
- _ws_id: Workspace ID
- included_groups: Array of group IDs to include (users must be in at least one)
- excluded_groups: Array of group IDs to exclude (users must not be in any)
- search_query: Text to search in full_name, display_name, and email
- include_archived: Whether to include archived users (default FALSE)
- link_status: Filter by platform link status - ''all'' (default), ''linked'', or ''virtual''';
