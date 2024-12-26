CREATE OR REPLACE FUNCTION get_possible_excluded_groups(_ws_id UUID, included_groups UUID[])
RETURNS TABLE (
    id UUID,
    name TEXT,
    ws_id UUID,
    amount BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH included_users AS (
        SELECT wugu.user_id
        FROM workspace_user_groups_users wugu
        WHERE wugu.group_id = ANY(included_groups)
    ),
    amounts AS (
        SELECT wugu.group_id, COUNT(*) as amount
        FROM workspace_user_groups_users wugu
        WHERE wugu.user_id IN (SELECT user_id FROM included_users)
        GROUP BY wugu.group_id
    )
    SELECT DISTINCT ON (wug.id)
        wug.id,
        wug.name,
        wug.ws_id,
        am.amount
    FROM workspace_user_groups wug
    JOIN workspace_user_groups_users wugu ON wug.id = wugu.group_id
    LEFT JOIN amounts am ON wug.id = am.group_id
    WHERE wug.ws_id = _ws_id AND wugu.user_id IN (SELECT user_id FROM included_users) AND NOT (wug.id = ANY(included_groups));
END; $$
LANGUAGE plpgsql;