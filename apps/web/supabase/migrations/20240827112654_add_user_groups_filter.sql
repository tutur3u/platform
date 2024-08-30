CREATE VIEW user_groups_with_tags AS
SELECT
    wug.*,
    (SELECT json_agg(wugt.id)
     FROM workspace_user_group_tags wugt
     JOIN workspace_user_group_tag_groups wugtg
     ON wugt.id = wugtg.tag_id
     WHERE wugtg.group_id = wugt.id) AS tags,
    (SELECT COUNT(*)
     FROM workspace_user_group_tags wugt
     JOIN workspace_user_group_tag_groups wugtg
     ON wugt.id = wugtg.tag_id
     WHERE wugtg.group_id = wugt.id) AS tag_count
FROM workspace_user_groups wug;

CREATE OR REPLACE FUNCTION get_workspace_user_groups(_ws_id UUID, included_tags UUID[], excluded_tags UUID[], search_query TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    notes TEXT,
    ws_id UUID,
    tags UUID[],
    tag_count BIGINT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ug.id,
        ug.name,
        ug.notes,
        ug.ws_id,
        ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) AS tags,
        ug.tag_count,
        ug.created_at
    FROM user_groups_with_tags ug
    WHERE ug.ws_id = _ws_id
    AND (search_query IS NULL OR (ug.name ILIKE '%' || search_query || '%'))
    AND ((included_tags IS NULL OR included_tags = ARRAY[]::uuid[] OR ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) && included_tags) AND (excluded_tags IS NULL OR excluded_tags = ARRAY[]::uuid[] OR NOT (ARRAY(SELECT json_array_elements_text(ug.tags)::UUID) && excluded_tags)));
END; $$
LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_possible_excluded_tags(_ws_id UUID, included_tags UUID[])
RETURNS TABLE (
    id UUID,
    name TEXT,
    ws_id UUID,
    amount BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (wugt.id)
        wugt.id,
        wugt.name,
        wugt.ws_id,
        (SELECT COUNT(*)
         FROM workspace_user_group_tag_groups ugtg
         WHERE ugtg.tag_id = wugt.id AND ugtg.group_id IN (
            SELECT ugtg.group_id
            FROM workspace_user_group_tag_groups ugtg
            WHERE ugtg.tag_id = ANY(included_tags)
         )) AS amount
    FROM workspace_user_group_tags wugt
    JOIN workspace_user_group_tag_groups ugtg ON wugt.id = ugtg.tag_id
    WHERE wugt.ws_id = _ws_id AND ugtg.group_id IN (
        SELECT ugtg.group_id
        FROM workspace_user_group_tag_groups ugtg
        WHERE ugtg.tag_id = ANY(included_tags)
    ) AND NOT (wugt.id = ANY(included_tags));
END; $$
LANGUAGE plpgsql;