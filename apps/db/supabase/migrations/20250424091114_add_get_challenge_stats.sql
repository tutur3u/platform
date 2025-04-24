CREATE OR REPLACE FUNCTION public.get_challenge_stats(challenge_id_param uuid, user_id_param uuid)
 RETURNS TABLE(total_score double precision, problems_attempted bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH user_sessions AS (
    SELECT id
    FROM nova_sessions
    WHERE challenge_id = challenge_id_param AND user_id = user_id_param
  ),
  best_submission_per_problem_per_session AS (
    -- For each session, find the best score for each problem
    SELECT
      us.id AS session_id,
      s.problem_id,
      MAX(s.total_score) AS best_problem_score
    FROM
      user_sessions us
    JOIN
      nova_submissions_with_scores s ON s.session_id = us.id
    GROUP BY
      us.id, s.problem_id
  ),
  session_scores AS (
    -- Calculate each session's total from the best score per problem
    SELECT
      session_id,
      SUM(best_problem_score) AS session_total_score,
      COUNT(problem_id) AS session_problems_attempted
    FROM
      best_submission_per_problem_per_session
    GROUP BY
      session_id
  ),
  best_session AS (
    -- Find the session with the highest total score
    SELECT
      session_total_score,
      session_problems_attempted
    FROM
      session_scores
    ORDER BY
      session_total_score DESC
    LIMIT 1
  )
  -- Return the best session stats, or zeros if no sessions exist
  SELECT
    COALESCE((SELECT session_total_score FROM best_session), 0) AS total_score,
    COALESCE((SELECT session_problems_attempted FROM best_session), 0) AS problems_attempted;
END; $function$
;