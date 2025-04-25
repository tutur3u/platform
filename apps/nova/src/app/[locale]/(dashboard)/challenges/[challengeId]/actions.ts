'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallengeCriteria,
  NovaSubmission,
  NovaSubmissionCriteria,
} from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';

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

export async function fetchSubmissions(
  problemId: string,
  sessionId?: string
): Promise<ExtendedNovaSubmission[]> {
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) return [];

  const queryBuilder = sbAdmin
    .from('nova_submissions_with_scores')
    .select(
      `
      *,
      criteria:nova_challenge_criteria(
        *,
        results:nova_submission_criteria(*)
      )
    `
    )
    .eq('problem_id', problemId);

  if (sessionId) {
    queryBuilder.eq('session_id', sessionId);
  }

  const { data: submissions, error } = await queryBuilder.eq(
    'user_id',
    user.id
  );

  if (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }

  return submissions
    .map((submission) => {
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
