alter table "public"."nova_sessions" add column "total_score" integer not null;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_total_score()
 RETURNS void
 LANGUAGE plpgsql
AS $function$DECLARE
    total_score INTEGER;
BEGIN
    -- Calculate the total score for the given challenge and user
    SELECT COALESCE(SUM(score), 0) INTO total_score
    FROM nova_submissions
    WHERE challenge_id = challenge_id_param
      AND user_id = user_id_param;

DECLARE
    new_total_score INTEGER;

SELECT COALESCE(SUM(score), 0) INTO new_total_score;

-- Update the total score in the nova_sessions table
UPDATE nova_sessions
SET total_score = new_total_score
WHERE challenge_id = challenge_id_param
  AND user_id = user_id_param;
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_total_submission_score(challenge_id_param uuid, user_id_param uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    total_score INTEGER;
BEGIN
    SELECT COALESCE(SUM(score), 0)
    INTO total_score
    FROM nova_submissions
    WHERE challenge_id = challenge_id_param AND user_id = user_id_param;

    RETURN total_score;
END;
$function$
;


