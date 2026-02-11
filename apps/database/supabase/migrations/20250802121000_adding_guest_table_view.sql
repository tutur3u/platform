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