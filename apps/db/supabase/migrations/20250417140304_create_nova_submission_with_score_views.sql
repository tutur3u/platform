CREATE OR REPLACE VIEW nova_submissions_with_scores AS
WITH test_case_stats AS (
  SELECT 
    submission_id,
    COUNT(*) AS total_tests,
    COUNT(CASE WHEN matched = true THEN 1 END) AS passed_tests
  FROM nova_submission_test_cases
  GROUP BY submission_id
),
criteria_stats AS (
  SELECT
    submission_id,
    COUNT(*) AS total_criteria,
    SUM(score) AS sum_criteria_score
  FROM nova_submission_criteria
  GROUP BY submission_id
)
SELECT 
  s.*,
  tc.total_tests,
  tc.passed_tests,
  cr.total_criteria,
  cr.sum_criteria_score,
  CASE 
    WHEN tc.total_tests > 0 THEN
      (COALESCE(tc.passed_tests, 0)::float / NULLIF(tc.total_tests, 0)::float) * 5 + 
      (COALESCE(cr.sum_criteria_score, 0)::float / (10 * NULLIF(cr.total_criteria, 0)::float)) * 5
    ELSE
      (COALESCE(cr.sum_criteria_score, 0)::float / (10 * NULLIF(cr.total_criteria, 0)::float)) * 10
  END AS calculated_score
FROM 
  nova_submissions s
LEFT JOIN test_case_stats tc ON s.id = tc.submission_id
LEFT JOIN criteria_stats cr ON s.id = cr.submission_id;