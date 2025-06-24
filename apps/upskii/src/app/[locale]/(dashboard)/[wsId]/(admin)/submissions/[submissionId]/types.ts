import type {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  NovaSubmission,
  NovaSubmissionCriteria,
  NovaSubmissionTestCase,
} from '@tuturuuu/types/db';

export type ExtendedNovaSubmission = NovaSubmission & {
  total_tests: number;
  passed_tests: number;
  test_case_score: number;
  criteria: (NovaChallengeCriteria & {
    result: NovaSubmissionCriteria;
  })[];
  total_criteria: number;
  sum_criterion_score: number;
  criteria_score: number;
  total_score: number;
  test_cases?: (NovaSubmissionTestCase & {
    test_case: NovaProblemTestCase;
  })[];
};

export type SubmissionData = ExtendedNovaSubmission & {
  problem: NovaProblem & {
    challenge: NovaChallenge;
  };
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    email?: string | null;
  };
  session?: NovaSession | null;
};
