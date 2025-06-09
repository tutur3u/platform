alter table "public"."workspace_quiz_sets" add column "allow_view_results" boolean not null default true;

alter table "public"."workspace_quiz_sets" add column "release_at" timestamp with time zone;

alter table "public"."workspace_quiz_sets" add column "release_points_immediately" boolean not null default true;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.sum_quiz_scores(p_set_id uuid)
 RETURNS TABLE(sum numeric)
 LANGUAGE sql
AS $function$
  SELECT COALESCE(SUM(wq.score), 0)::numeric
  FROM quiz_set_quizzes qsq
  JOIN workspace_quizzes wq ON qsq.quiz_id = wq.id
  WHERE qsq.set_id = p_set_id;
$function$
;


