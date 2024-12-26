set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.workspace_members(ws_id, user_id)
    VALUES (new.id, auth.uid());
  END IF;
  RETURN new;
END;$function$
;


