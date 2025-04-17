import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaSession,
  NovaSubmission,
  NovaSubmissionCriteria,
} from '@tuturuuu/types/db';

export type ExtendedNovaSubmission = NovaSubmission & {
  total_tests: number;
  passed_tests: number;
  test_case_score: number;
  criteria: (NovaChallengeCriteria & NovaSubmissionCriteria)[];
  total_criteria: number;
  sum_criterion_score: number;
  criteria_score: number;
  total_score: number;
};

export type ResultsData = {
  challenge: NovaChallenge;
  sessions: (NovaSession & {
    problems: (NovaProblem & {
      submissions: ExtendedNovaSubmission[];
    })[];
  })[];
};
