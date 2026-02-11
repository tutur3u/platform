-- Update get_workspace_users RPC function to include archived and archived_until fields
-- Step 1: Drop existing function (required to change return type)
DROP FUNCTION IF EXISTS get_workspace_users(UUID, UUID[], UUID[], TEXT);

-- Step 2: Recreate function with new return type
CREATE FUNCTION get_workspace_users(_ws_id UUID, included_groups UUID[], excluded_groups UUID[], search_query TEXT)
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
    AND (search_query IS NULL OR (wu.full_name ILIKE '%' || search_query || '%' OR wu.display_name ILIKE '%' || search_query || '%'))
    AND ((included_groups IS NULL OR included_groups = ARRAY[]::uuid[] OR ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && included_groups) AND (excluded_groups IS NULL OR excluded_groups = ARRAY[]::uuid[] OR NOT (ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && excluded_groups)));
END; $$
LANGUAGE plpgsql;
