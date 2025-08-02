set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_guest_group(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM workspace_user_groups ws
    WHERE ws.ws_id = check_guest_group.ws_id
      AND ws.is_guest = TRUE
  );
END;$function$
;

create or replace view "public"."group_with_attendance" as  SELECT wug.id AS group_id,
    wug.ws_id,
    wuuu.user_id,
    wu.full_name,
    wu.email,
    wu.gender,
    wu.phone,
    count(uga.*) AS attendance_count
   FROM (((workspace_user_groups wug
     JOIN workspace_user_groups_users wuuu ON ((wug.id = wuuu.group_id)))
     JOIN workspace_users wu ON ((wuuu.user_id = wu.id)))
     LEFT JOIN user_group_attendance uga ON ((uga.user_id = wuuu.user_id)))
  WHERE (wug.is_guest = true)
  GROUP BY wug.id, wug.ws_id, wuuu.user_id, wu.full_name, wu.email, wu.gender, wu.phone;



