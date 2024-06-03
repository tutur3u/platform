CREATE VIEW workspace_users_with_groups AS
SELECT
    wu.*,
    (SELECT json_agg(wug.id)
     FROM workspace_user_groups wug
     JOIN workspace_user_groups_users wugu
     ON wug.id = wugu.group_id
     WHERE wugu.user_id = wu.id) AS groups,
    (SELECT COUNT(*)
     FROM workspace_user_groups wug
     JOIN workspace_user_groups_users wugu
     ON wug.id = wugu.group_id
     WHERE wugu.user_id = wu.id) AS group_count,
    (SELECT json_agg(linked_users) FROM (
        SELECT DISTINCT ON (wulu.platform_user_id)
            wulu.platform_user_id,
            u.display_name
        FROM workspace_user_linked_users wulu
        JOIN users u ON wulu.platform_user_id = u.id
        JOIN workspace_members wm ON u.id = wm.user_id
        WHERE wm.user_id = u.id AND wulu.virtual_user_id = wu.id
    ) AS linked_users) AS linked_users
FROM workspace_users wu;

CREATE OR REPLACE FUNCTION get_workspace_users(_ws_id UUID, included_groups UUID[], excluded_groups UUID[], search_query TEXT)
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
        wu.created_at,
        wu.updated_at
    FROM workspace_users_with_groups wu
    WHERE wu.ws_id = _ws_id
    AND (search_query IS NULL OR (wu.full_name ILIKE '%' || search_query || '%' OR wu.display_name ILIKE '%' || search_query || '%'))
    AND ((included_groups IS NULL OR included_groups = ARRAY[]::uuid[] OR ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && included_groups) AND (excluded_groups IS NULL OR excluded_groups = ARRAY[]::uuid[] OR NOT (ARRAY(SELECT json_array_elements_text(wu.groups)::UUID) && excluded_groups)));
END; $$
LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_possible_excluded_groups(_ws_id UUID, included_groups UUID[])
RETURNS TABLE (
    id UUID,
    name TEXT,
    ws_id UUID,
    amount BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (wug.id)
        wug.id,
        wug.name,
        wug.ws_id,
        (SELECT COUNT(*)
         FROM workspace_user_groups_users wugu
         WHERE wugu.group_id = wug.id AND wugu.user_id IN (
            SELECT wugu.user_id
            FROM workspace_user_groups_users wugu
            WHERE wugu.group_id = ANY(included_groups)
         )) AS amount
    FROM workspace_user_groups wug
    JOIN workspace_user_groups_users wugu ON wug.id = wugu.group_id
    WHERE wug.ws_id = _ws_id AND wugu.user_id IN (
        SELECT wugu.user_id
        FROM workspace_user_groups_users wugu
        WHERE wugu.group_id = ANY(included_groups)
    ) AND NOT (wug.id = ANY(included_groups));
END; $$
LANGUAGE plpgsql;