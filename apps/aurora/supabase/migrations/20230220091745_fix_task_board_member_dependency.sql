set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_task_board_member(_user_id uuid, _board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM project_boards
  WHERE id = _board_id
);
$function$
;


