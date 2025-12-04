CREATE OR REPLACE FUNCTION public.check_ws_creator(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN (
    (
      SELECT creator_id FROM public.workspaces WHERE id = check_ws_creator.ws_id
    ) = auth.uid()
  );
END;$function$
;