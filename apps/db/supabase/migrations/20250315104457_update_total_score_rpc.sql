drop function if exists "public"."calculate_total_score"();

drop function if exists "public"."get_total_submission_score"(challenge_id_param uuid, user_id_param uuid);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_session_total_score(challenge_id_param uuid, user_id_param uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$DECLARE new_total_score INTEGER;
BEGIN
    SELECT COALESCE(SUM(max_score), 0) INTO new_total_score
    FROM (
        SELECT MAX(score) as max_score
        FROM nova_submissions
        WHERE user_id = user_id_param
        GROUP BY problem_id
    ) as max_scores;

    UPDATE nova_sessions
    SET total_score = new_total_score
    WHERE challenge_id = challenge_id_param
    AND user_id = user_id_param;
END;$function$
;


