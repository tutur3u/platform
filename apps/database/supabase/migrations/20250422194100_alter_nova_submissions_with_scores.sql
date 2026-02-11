DROP VIEW IF EXISTS nova_submissions_with_scores;

CREATE OR REPLACE VIEW nova_submissions_with_scores AS
WITH problem_test_counts AS (
  SELECT 
    problem_id,
    COUNT(*) AS total_tests
  FROM nova_problem_test_cases
  GROUP BY problem_id
),
challenge_criteria_counts AS (
  SELECT 
    p.id AS problem_id,
    COUNT(cc.id) AS total_criteria
  FROM nova_problems p
  JOIN nova_challenge_criteria cc ON p.challenge_id = cc.challenge_id
  GROUP BY p.id
),
submission_test_stats AS (
  SELECT 
    submission_id,
    COUNT(CASE WHEN matched = true THEN 1 END) AS passed_tests
  FROM nova_submission_test_cases
  GROUP BY submission_id
),
submission_criteria_stats AS (
  SELECT
    submission_id,
    SUM(score) AS sum_criterion_score
  FROM nova_submission_criteria
  GROUP BY submission_id
)
SELECT 
  s.*,
  COALESCE(ptc.total_tests, 0) AS total_tests,
  COALESCE(ts.passed_tests, 0) AS passed_tests,
  COALESCE((ts.passed_tests::float / NULLIF(ptc.total_tests, 0)) * 10, 0) AS test_case_score,
  COALESCE(ccc.total_criteria, 0) AS total_criteria,
  COALESCE(cs.sum_criterion_score, 0) AS sum_criterion_score,
  COALESCE((cs.sum_criterion_score::float / NULLIF(ccc.total_criteria * 10, 0)) * 10, 0) AS criteria_score,
  CASE
    WHEN COALESCE(ptc.total_tests, 0) > 0 AND COALESCE(ccc.total_criteria, 0) > 0 THEN 
      COALESCE((ts.passed_tests::float / NULLIF(ptc.total_tests, 0)) * 5, 0) + 
      COALESCE((cs.sum_criterion_score::float / NULLIF(ccc.total_criteria * 10, 0)) * 5, 0)
    WHEN COALESCE(ptc.total_tests, 0) > 0 THEN 
      COALESCE((ts.passed_tests::float / NULLIF(ptc.total_tests, 0)) * 10, 0)
    WHEN COALESCE(ccc.total_criteria, 0) > 0 THEN 
      COALESCE((cs.sum_criterion_score::float / NULLIF(ccc.total_criteria * 10, 0)) * 10, 0)
    ELSE 0
  END AS total_score
FROM nova_submissions s
LEFT JOIN problem_test_counts ptc ON s.problem_id = ptc.problem_id
LEFT JOIN challenge_criteria_counts ccc ON s.problem_id = ccc.problem_id
LEFT JOIN submission_test_stats ts ON s.id = ts.submission_id
LEFT JOIN submission_criteria_stats cs ON s.id = cs.submission_id;