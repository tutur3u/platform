'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallengeCriteria,
  NovaProblemTestCase,
  NovaSubmission,
  NovaSubmissionCriteria,
  NovaSubmissionTestCase,
} from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';

export type ExtendedNovaSubmission = NovaSubmission & {
  test_cases: (NovaProblemTestCase & {
    result: NovaSubmissionTestCase;
  })[];
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
  overall_assessment: string;
};

export async function fetchSubmissions(
  problemId: string
): Promise<ExtendedNovaSubmission[]> {
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) return [];

  const { data: submissions, error } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select(
      `
      *,
      test_cases:nova_problem_test_cases(
        *,
        results:nova_submission_test_cases(*)
      ),
      criteria:nova_challenge_criteria(
        *,
        results:nova_submission_criteria(*)
      )
    `
    )
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }

  return submissions
    .map((submission) => {
      // Map testcases to expected format
      const testcases = submission.test_cases.map((testcase) => ({
        ...testcase,
        results: undefined,
        result: testcase.results.find(
          (result) => result.submission_id === submission.id
        ),
      }));

      // Map criteria to expected format
      const criteria = submission.criteria.map((criterion) => ({
        ...criterion,
        results: undefined,
        result: criterion.results.find(
          (result) => result.submission_id === submission.id
        ),
      }));

      // Return properly typed submission
      return {
        ...submission,
        overall_assessment: '',
        test_cases: testcases,
        total_tests: submission.total_tests || 0,
        passed_tests: submission.passed_tests || 0,
        test_case_score: submission.test_case_score || 0,
        criteria,
        total_criteria: submission.total_criteria || 0,
        sum_criterion_score: submission.sum_criterion_score || 0,
        criteria_score: submission.criteria_score || 0,
        total_score: submission.total_score || 0,
      } as ExtendedNovaSubmission;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
}
