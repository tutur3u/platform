set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.workspace_members(ws_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$function$
;


