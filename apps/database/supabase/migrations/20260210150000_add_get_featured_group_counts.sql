-- Add get_featured_group_counts RPC function
-- Returns the count of workspace users in each featured group that match the current filters
-- (search, excluded groups, status, link status). This enables the quick-filter chips
-- to show accurate filtered counts instead of total group membership.

CREATE OR REPLACE FUNCTION get_featured_group_counts(
    _ws_id UUID,
    _featured_group_ids UUID[],
    _excluded_groups UUID[] DEFAULT ARRAY[]::UUID[],
    _search_query TEXT DEFAULT NULL,
    _status TEXT DEFAULT 'active',
    _link_status TEXT DEFAULT 'all'
)
RETURNS TABLE (group_id UUID, user_count BIGINT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH filtered_users AS (
        -- Compute the set of users passing all non-group-inclusion filters (single scan)
        SELECT wu.id AS user_id
        FROM workspace_users_with_groups wu
        WHERE wu.ws_id = _ws_id
        AND (
            _search_query IS NULL
            OR _search_query = ''
            OR COALESCE(wu.full_name, '') ILIKE '%' || _search_query || '%'
            OR COALESCE(wu.display_name, '') ILIKE '%' || _search_query || '%'
            OR COALESCE(wu.email, '') ILIKE '%' || _search_query || '%'
        )
        AND (
            _excluded_groups IS NULL
            OR _excluded_groups = ARRAY[]::UUID[]
            OR NOT (ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && _excluded_groups)
        )
        AND (
            CASE _status
                WHEN 'active' THEN wu.archived IS NOT TRUE
                WHEN 'archived' THEN wu.archived = TRUE AND wu.archived_until IS NULL
                WHEN 'archived_until' THEN wu.archived_until > NOW()
                ELSE TRUE
            END
        )
        AND (
            _link_status = 'all'
            OR (_link_status = 'linked' AND wu.linked_users IS NOT NULL)
            OR (_link_status = 'virtual' AND wu.linked_users IS NULL)
        )
    )
    SELECT fg.gid AS group_id, COUNT(DISTINCT fu.user_id) AS user_count
    FROM unnest(_featured_group_ids) AS fg(gid)
    LEFT JOIN workspace_user_groups_users wugu ON wugu.group_id = fg.gid
    LEFT JOIN filtered_users fu ON fu.user_id = wugu.user_id
    GROUP BY fg.gid;
END; $$;

COMMENT ON FUNCTION get_featured_group_counts(UUID, UUID[], UUID[], TEXT, TEXT, TEXT) IS
'Returns the count of workspace users in each featured group that match current filters.
Parameters:
- _ws_id: Workspace ID
- _featured_group_ids: Array of group IDs to get counts for
- _excluded_groups: Array of group IDs to exclude from counting
- _search_query: Text to search in full_name, display_name, and email
- _status: User status filter - ''active'' (default), ''archived'', ''archived_until'', or ''all''
- _link_status: Platform link status filter - ''all'' (default), ''linked'', or ''virtual''';
