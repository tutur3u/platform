set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_ws_creator(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN (
    (SELECT creator_id FROM public.workspaces WHERE id = ws_id)
    = auth.uid()
    AND
    NOT EXISTS (
      SELECT 1 FROM public.workspace_subscription
      WHERE public.workspace_subscription.ws_id = ws_id
    )
  );
END;$function$
;


