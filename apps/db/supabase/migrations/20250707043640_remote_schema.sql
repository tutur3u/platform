create extension if not exists "pg_trgm" with schema "extensions";

alter table "public"."workspace_quiz_attempt_answers" enable row level security;

alter table "public"."workspace_quiz_attempts" enable row level security;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_tasks(_board_id uuid)
 RETURNS TABLE(id uuid, name text, description text, priority smallint, completed boolean, start_date timestamp with time zone, end_date timestamp with time zone, list_id uuid, board_id uuid)
 LANGUAGE plpgsql
AS $function$
	begin
		return query
			select t.id, t.name, t.description, t.priority, t.completed, t.start_date, t.end_date, t.list_id, l.board_id
      from tasks t, task_lists l, task_assignees a
      where auth.uid() = a.user_id and
      l.board_id = _board_id and
      t.list_id = l.id and
      t.id = a.task_id and
      t.completed = false
      order by t.priority DESC, t.end_date ASC NULLS LAST;
	end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_accessible(_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM task_lists tl
  WHERE tl.id = _list_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_accessible(_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM tasks
  WHERE tasks.id = _task_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.validate_board_tags(tags jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Use the normalize function for validation, but catch specific exceptions
  BEGIN
    PERFORM validate_and_normalize_board_tags(tags);
    RETURN true;
  EXCEPTION
    -- Only catch the specific exceptions we raise in validate_and_normalize_board_tags
    WHEN SQLSTATE '22000' THEN  -- our custom validation errors
      RETURN false;
    WHEN OTHERS THEN
      -- Re-raise unexpected errors to avoid masking bugs
      RAISE;
  END;
END;
$function$
;