import { describe, expect, it } from 'vitest';
import {
  aggregateByChallenge,
  calculateBestScores,
  calculatePercentage,
  calculateScore,
  formatScore,
  type ScoreInput,
} from '../calculate';

describe('calculateScore', () => {
  it('should correctly calculate score with only tests', () => {
    const input: ScoreInput = {
      total_tests: 10,
      passed_tests: 5,
      total_criteria: 0,
      sum_criterion_score: 0,
    };

    // With updated logic, only tests should get 100% weight
    expect(calculateScore(input)).toBe(5); // (5/10) * 10 * 1.0 = 5
  });

  it('should correctly calculate score with only criteria', () => {
    const input: ScoreInput = {
      total_tests: 0,
      passed_tests: 0,
      total_criteria: 5,
      sum_criterion_score: 25, // 5 criteria with average score of 5
    };

    expect(calculateScore(input)).toBe(5); // (25/(5*10)) * 10 * 1.0 = 5
  });

  it('should correctly calculate score with both tests and criteria', () => {
    const input: ScoreInput = {
      total_tests: 10,
      passed_tests: 8,
      total_criteria: 5,
      sum_criterion_score: 40, // 5 criteria with average score of 8
    };

    // Test score: (8/10) * 10 * 0.5 = 4
    // Criteria score: (40/(5*10)) * 10 * 0.5 = 4
    // Total: 4 + 4 = 8
    expect(calculateScore(input)).toBe(8);
  });

  it('should give full weight to tests when criteria do not exist', () => {
    const input: ScoreInput = {
      total_tests: 10,
      passed_tests: 7,
      total_criteria: 0,
      sum_criterion_score: 0,
    };

    // No criteria, so tests get 100% weight
    // Test score: (7/10) * 10 * 1.0 = 7
    expect(calculateScore(input)).toBe(7);
  });

  it('should handle zero test cases with criteria', () => {
    const input: ScoreInput = {
      total_tests: 0,
      passed_tests: 0,
      total_criteria: 5,
      sum_criterion_score: 25, // 5 criteria with average score of 5
    };

    // No tests, so criteria gets 100% weight
    // Criteria score: (25/(5*10)) * 10 * 1.0 = 5
    expect(calculateScore(input)).toBe(5);
  });

  it('should handle null values', () => {
    const input: ScoreInput = {
      total_tests: null,
      passed_tests: null,
      total_criteria: null,
      sum_criterion_score: null,
    };

    expect(calculateScore(input)).toBe(0);
  });

  it('should handle undefined values', () => {
    const input: ScoreInput = {};

    expect(calculateScore(input)).toBe(0);
  });
});

describe('calculateBestScores', () => {
  it('should return the best score for each problem', () => {
    const submissions = [
      { problem_id: 'p1', total_tests: 10, passed_tests: 5 },
      { problem_id: 'p1', total_tests: 10, passed_tests: 7 },
      { problem_id: 'p2', total_tests: 10, passed_tests: 3 },
      { problem_id: 'p2', total_tests: 10, passed_tests: 6 },
    ];

    const bestScores = calculateBestScores(submissions);

    // With the updated logic: (passed/total) * 10 * 1.0 for tests only
    expect(bestScores.get('p1')).toBe(7); // (7/10) * 10 * 1.0 = 7
    expect(bestScores.get('p2')).toBe(6); // (6/10) * 10 * 1.0 = 6
  });

  it('should handle submissions with both tests and criteria', () => {
    const submissions = [
      {
        problem_id: 'p1',
        total_tests: 10,
        passed_tests: 8,
        total_criteria: 4,
        sum_criterion_score: 32, // Average of 8 per criterion
      },
      {
        problem_id: 'p1',
        total_tests: 10,
        passed_tests: 6,
        total_criteria: 5,
        sum_criterion_score: 45, // Average of 9 per criterion
      },
    ];

    const bestScores = calculateBestScores(submissions);

    // First submission:
    // Tests: (8/10) * 10 * 0.5 = 4
    // Criteria: (32/(4*10)) * 10 * 0.5 = 4
    // Total: 8

    // Second submission:
    // Tests: (6/10) * 10 * 0.5 = 3
    // Criteria: (45/(5*10)) * 10 * 0.5 = 4.5
    // Total: 7.5

    expect(bestScores.get('p1')).toBe(8);
  });

  it('should skip submissions without problem_id', () => {
    const submissions = [
      { problem_id: 'p1', total_tests: 10, passed_tests: 5 },
      { problem_id: '', total_tests: 10, passed_tests: 7 },
    ];

    const bestScores = calculateBestScores(submissions);

    expect(bestScores.get('p1')).toBe(5); // (5/10) * 10 * 1.0 = 5
    expect(bestScores.size).toBe(1);
  });

  it('should return an empty map when no valid submissions exist', () => {
    const submissions: Array<ScoreInput & { problem_id: string }> = [];

    const bestScores = calculateBestScores(submissions);

    expect(bestScores.size).toBe(0);
  });
});

describe('aggregateByChallenge', () => {
  it('should correctly aggregate scores by challenge', () => {
    const problemScores = new Map([
      ['p1', 5],
      ['p2', 7],
      ['p3', 3],
    ]);

    const problemChallengeMap = new Map([
      ['p1', 'c1'],
      ['p2', 'c1'],
      ['p3', 'c2'],
    ]);

    const challengeScores = aggregateByChallenge(
      problemScores,
      problemChallengeMap
    );

    expect(challengeScores.c1).toBe(12); // 5 + 7
    expect(challengeScores.c2).toBe(3);
  });

  it('should ignore problems that are not in the challenge map', () => {
    const problemScores = new Map([
      ['p1', 5],
      ['p2', 7],
      ['p3', 3],
    ]);

    const problemChallengeMap = new Map([
      ['p1', 'c1'],
      ['p3', 'c2'],
    ]);

    const challengeScores = aggregateByChallenge(
      problemScores,
      problemChallengeMap
    );

    expect(challengeScores.c1).toBe(5);
    expect(challengeScores.c2).toBe(3);
    expect(Object.keys(challengeScores).length).toBe(2);
  });

  it('should return an empty object when no problems match challenges', () => {
    const problemScores = new Map([
      ['p1', 5],
      ['p2', 7],
    ]);

    const problemChallengeMap = new Map([
      ['p3', 'c1'],
      ['p4', 'c2'],
    ]);

    const challengeScores = aggregateByChallenge(
      problemScores,
      problemChallengeMap
    );

    expect(Object.keys(challengeScores).length).toBe(0);
  });
});

describe('formatScore', () => {
  it('should format score with default decimal places (1)', () => {
    expect(formatScore(5)).toBe('5.0');
    expect(formatScore(5.678)).toBe('5.7');
  });

  it('should format score with specified decimal places', () => {
    expect(formatScore(5, 0)).toBe('5');
    expect(formatScore(5.678, 2)).toBe('5.68');
    expect(formatScore(5.678, 3)).toBe('5.678');
  });
});

describe('calculatePercentage', () => {
  it('should correctly calculate percentage', () => {
    expect(calculatePercentage(5, 10)).toBe(50);
    expect(calculatePercentage(7.5, 10)).toBe(75);
    expect(calculatePercentage(0, 10)).toBe(0);
    expect(calculatePercentage(10, 10)).toBe(100);
  });

  it('should return 0 when maxScore is 0 or negative', () => {
    expect(calculatePercentage(5, 0)).toBe(0);
    expect(calculatePercentage(5, -10)).toBe(0);
  });
});
