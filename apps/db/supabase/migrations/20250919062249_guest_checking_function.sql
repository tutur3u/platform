set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_user_guest(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM workspace_users_with_groups wu,
    LATERAL jsonb_array_elements_text(wu.groups::jsonb) AS user_group_element
    JOIN workspace_user_groups wug ON user_group_element::uuid = wug.id
    WHERE wu.id = user_uuid
      AND wug.is_guest = TRUE
  );
END;
$function$
;


