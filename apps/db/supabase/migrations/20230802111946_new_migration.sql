set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_task_board_member(_user_id uuid, _board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
        SELECT 1
        FROM workspace_boards
        WHERE id = _board_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_task_in_board(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM tasks, task_lists lists
  WHERE tasks.id = _task_id
  AND lists.id = tasks.list_id
);
$function$
;


