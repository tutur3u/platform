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
    SUM(score) AS sum_criterion_score
  FROM nova_submission_criteria
  GROUP BY submission_id
)
SELECT 
  s.*,
  tc.total_tests,
  tc.passed_tests,
  COALESCE((tc.passed_tests::float / NULLIF(tc.total_tests, 0)) * 10, 0) AS test_case_score,
  cr.total_criteria,
  cr.sum_criterion_score,
  COALESCE((cr.sum_criterion_score::float / NULLIF(cr.total_criteria * 10, 0)) * 10, 0) AS criteria_score,
  CASE
    WHEN tc.total_tests > 0 AND cr.total_criteria > 0 THEN 
      COALESCE((tc.passed_tests::float / tc.total_tests) * 5, 0) + 
      COALESCE((cr.sum_criterion_score::float / (cr.total_criteria * 10)) * 5, 0)
    WHEN tc.total_tests > 0 THEN 
      COALESCE((tc.passed_tests::float / tc.total_tests) * 10, 0)
    WHEN cr.total_criteria > 0 THEN 
      COALESCE((cr.sum_criterion_score::float / (cr.total_criteria * 10)) * 10, 0)
    ELSE 0
  END AS total_score
FROM nova_submissions s
LEFT JOIN test_case_stats tc ON s.id = tc.submission_id
LEFT JOIN criteria_stats cr ON s.id = cr.submission_id;