import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaSubmission,
  NovaSubmissionCriteria,
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
};

export type SubmissionData = ExtendedNovaSubmission & {
  problem: NovaProblem & {
    challenge: NovaChallenge;
  };
  user: {
    display_name: string;
    avatar_url: string;
  };
};
