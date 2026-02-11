CREATE OR REPLACE FUNCTION get_submission_statistics(
  challenge_id_param UUID DEFAULT NULL,
  problem_id_param UUID DEFAULT NULL,
  search_param TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  average_score DECIMAL(10,2),
  highest_score DECIMAL(10,2),
  last_submission_date TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_submissions AS (
    SELECT
      s.*
    FROM
      nova_submissions_with_scores s
      LEFT JOIN nova_problems p ON s.problem_id = p.id
    WHERE
      -- Apply challenge filter if provided
      (challenge_id_param IS NULL OR p.challenge_id = challenge_id_param)
      -- Apply problem filter if provided
      AND (problem_id_param IS NULL OR s.problem_id = problem_id_param)
      -- Apply search filter if provided
      AND (
        search_param IS NULL
        OR s.prompt ILIKE '%' || search_param || '%'
        OR s.feedback ILIKE '%' || search_param || '%'
      )
  )
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COALESCE(AVG(total_score), 0)::DECIMAL(10,2) AS average_score,
    COALESCE(MAX(total_score), 0)::DECIMAL(10,2) AS highest_score,
    MAX(created_at) AS last_submission_date
  FROM
    filtered_submissions;
END;
$$;