-- Drop the existing view first
DROP VIEW IF EXISTS nova_submissions_with_scores;

-- Create the optimized view with materialized CTEs for better performance
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
    COUNT(*) FILTER (WHERE matched = true) AS passed_tests
  FROM nova_submission_test_cases
  GROUP BY submission_id
),
submission_criteria_stats AS (
  SELECT
    submission_id,
    SUM(score) AS sum_criterion_score
  FROM nova_submission_criteria
  GROUP BY submission_id
),
-- Combine the problem and challenge statistics to reduce joins
problem_stats AS (
  SELECT
    p.problem_id,
    p.total_tests,
    COALESCE(c.total_criteria, 0) AS total_criteria
  FROM problem_test_counts p
  LEFT JOIN challenge_criteria_counts c ON p.problem_id = c.problem_id
),
-- Pre-calculate score components with fewer joins
score_components AS (
  SELECT 
    s.id,
    s.problem_id,
    COALESCE(ps.total_tests, 0) AS total_tests,
    COALESCE(ts.passed_tests, 0) AS passed_tests,
    COALESCE(ps.total_criteria, 0) AS total_criteria,
    COALESCE(cs.sum_criterion_score, 0) AS sum_criterion_score,
    -- Simplified test case score calculation
    CASE WHEN COALESCE(ps.total_tests, 0) = 0 THEN 0
         ELSE (COALESCE(ts.passed_tests, 0)::float / ps.total_tests) * 10
    END AS test_case_score,
    -- Simplified criteria score calculation
    CASE WHEN COALESCE(ps.total_criteria, 0) = 0 THEN 0
         ELSE (COALESCE(cs.sum_criterion_score, 0)::float / (ps.total_criteria * 10)) * 10
    END AS criteria_score
  FROM nova_submissions s
  LEFT JOIN problem_stats ps ON s.problem_id = ps.problem_id
  LEFT JOIN submission_test_stats ts ON s.id = ts.submission_id
  LEFT JOIN submission_criteria_stats cs ON s.id = cs.submission_id
)
SELECT 
  s.*,
  sc.total_tests,
  sc.passed_tests,
  sc.test_case_score,
  sc.total_criteria,
  sc.sum_criterion_score,
  sc.criteria_score,
  -- Simplified total score calculation
  CASE
    WHEN sc.total_tests > 0 AND sc.total_criteria > 0 THEN 
      (sc.test_case_score + sc.criteria_score) * 0.5
    WHEN sc.total_tests > 0 THEN 
      sc.test_case_score
    WHEN sc.total_criteria > 0 THEN 
      sc.criteria_score
    ELSE 0
  END AS total_score
FROM nova_submissions s
JOIN score_components sc ON s.id = sc.id;

-- Add an index to improve join performance
CREATE INDEX IF NOT EXISTS idx_nova_submissions_problem_id ON nova_submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_nova_submission_test_cases_submission_id ON nova_submission_test_cases(submission_id);
CREATE INDEX IF NOT EXISTS idx_nova_submission_criteria_submission_id ON nova_submission_criteria(submission_id);
CREATE INDEX IF NOT EXISTS idx_nova_problem_test_cases_problem_id ON nova_problem_test_cases(problem_id); 