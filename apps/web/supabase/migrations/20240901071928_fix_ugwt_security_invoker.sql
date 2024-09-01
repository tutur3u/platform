DROP VIEW IF EXISTS user_groups_with_tags;

CREATE VIEW user_groups_with_tags WITH (security_invoker=on) AS
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