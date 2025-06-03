/**
 * Score calculation utility functions for Nova
 *
 * This module provides standardized functions for calculating scores
 * across the Nova platform to ensure consistency.
 */

export interface ScoreInput {
  total_tests?: number | null;
  passed_tests?: number | null;
  total_criteria?: number | null;
  sum_criterion_score?: number | null;
}

/**
 * Calculates a standardized score based on test cases and criteria evaluation
 *
 * The score is calculated as follows:
 * 1. If both tests and criteria exist:
 *    - Test Score = (passed_tests/total_tests) * 10 * 0.5
 *    - Criteria Score = (sum_criterion_score/(total_criteria*10)) * 10 * 0.5
 * 2. If only criteria exist:
 *    - Criteria Score = (sum_criterion_score/(total_criteria*10)) * 10 * 1.0
 * 3. If only tests exist:
 *    - Test Score = (passed_tests/total_tests) * 10 * 1.0
 *
 * Each problem has a maximum score of 10 points
 *
 * @param submission Object containing test and criteria data
 * @returns Calculated score (0-10)
 */
export function calculateScore(submission: ScoreInput): number {
  const totalTests = submission.total_tests || 0;
  const passedTests = submission.passed_tests || 0;
  const totalCriteria = submission.total_criteria || 0;
  const sumCriterionScore = submission.sum_criterion_score || 0;

  const hasCriteria = totalCriteria > 0;
  const hasTests = totalTests > 0;

  let criteriaScore = 0;
  let testScore = 0;

  // Calculate criteria score
  if (hasCriteria) {
    // Criteria weight is 0.5 if tests exist, 1.0 otherwise
    const criteriaWeight = hasTests ? 0.5 : 1.0;
    criteriaScore =
      (sumCriterionScore / (totalCriteria * 10)) * 10 * criteriaWeight;
  }

  // Calculate test score
  if (hasTests) {
    // Test weight is 0.5 when both tests and criteria exist, 1.0 when only tests exist
    const testWeight = hasCriteria ? 0.5 : 1.0;
    testScore = (passedTests / totalTests) * 10 * testWeight;
  }

  return criteriaScore + testScore;
}

/**
 * Calculates scores for multiple problems and returns the best score for each
 *
 * @param submissions Array of submission objects with problem IDs
 * @returns Map of problem ID to best score
 */
export function calculateBestScores(
  submissions: Array<ScoreInput & { problem_id: string }>
): Map<string, number> {
  const bestScores = new Map<string, number>();

  submissions.forEach((submission) => {
    if (!submission.problem_id) return;

    const score = calculateScore(submission);
    const currentBest = bestScores.get(submission.problem_id) || 0;

    if (score > currentBest) {
      bestScores.set(submission.problem_id, score);
    }
  });

  return bestScores;
}

/**
 * Aggregates scores by challenge
 *
 * @param problemScores Map of problem ID to score
 * @param problemChallengeMap Map of problem ID to challenge ID
 * @returns Object mapping challenge IDs to their total scores
 */
export function aggregateByChallenge(
  problemScores: Map<string, number>,
  problemChallengeMap: Map<string, string>
): Record<string, number> {
  const challengeScores: Record<string, number> = {};

  problemScores.forEach((score, problemId) => {
    const challengeId = problemChallengeMap.get(problemId);
    if (challengeId) {
      challengeScores[challengeId] =
        (challengeScores[challengeId] || 0) + score;
    }
  });

  return challengeScores;
}

/**
 * Formats a score for display
 *
 * @param score Raw score number
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted score string
 */
export function formatScore(score: number, decimals: number = 1): string {
  return score.toFixed(decimals);
}

/**
 * Calculates percentage based on score and maximum possible score
 *
 * @param score Current score
 * @param maxScore Maximum possible score
 * @returns Percentage (0-100)
 */
export function calculatePercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return (score / maxScore) * 100;
}
