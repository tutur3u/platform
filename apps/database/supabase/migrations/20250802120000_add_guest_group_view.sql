create or replace view "public"."workspace_user_groups_with_guest" as  SELECT workspace_user_groups.id,
    workspace_user_groups.ws_id,
    workspace_user_groups.name,
    workspace_user_groups.created_at,
    workspace_user_groups.archived,
    workspace_user_groups.ending_date,
    workspace_user_groups.notes,
    workspace_user_groups.sessions,
    workspace_user_groups.starting_date,
    workspace_user_groups.is_guest,
    count(workspace_user_groups_users.*) AS amount
   FROM (workspace_user_groups
     LEFT JOIN workspace_user_groups_users ON ((workspace_user_groups_users.group_id = workspace_user_groups.id)))
  GROUP BY workspace_user_groups.id;



