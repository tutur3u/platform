'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NovaSubmissionWithScores } from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';

export async function fetchSubmissions(
  problemId: string
): Promise<NovaSubmissionWithScores[]> {
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) throw new Error('User not found');

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
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  const { data: submissions, error } = await queryBuilder;

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
        criteria,
      } as NovaSubmissionWithScores;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at || '').getTime() -
        new Date(a.created_at || '').getTime()
    );
}
