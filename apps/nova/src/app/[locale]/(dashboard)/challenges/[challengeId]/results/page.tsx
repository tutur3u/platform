import ResultClient from './client';
import { ExtendedNovaSubmission, ResultsData } from './types';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) redirect('/dashboard');

  try {
    // Get challenge
    const { data: challenge } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Get sessions
    const { data: sessions } = await sbAdmin
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id);

    if (!sessions) {
      throw new Error('Sessions not found');
    }

    // Query problems with submissions from the view
    const { data: problems } = await sbAdmin
      .from('nova_problems')
      .select(
        `
        *,
        submissions:nova_submissions_with_scores(
          *,
          criteria:nova_challenge_criteria(
            *,
            results:nova_submission_criteria(*)
          )
        )
      `
      )
      .eq('challenge_id', challengeId);

    // Transform the data to match the expected structure
    const data: ResultsData = {
      challenge,
      sessions: sessions.map((session) => ({
        ...session,
        problems:
          problems?.map((problem) => {
            return {
              ...problem,
              submissions: problem.submissions
                .filter((submission) => submission.session_id === session.id)
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
                    total_tests: submission.total_tests || 0,
                    passed_tests: submission.passed_tests || 0,
                    test_case_score: submission.test_case_score || 0,
                    criteria,
                    total_criteria: submission.total_criteria || 0,
                    sum_criterion_score: submission.sum_criterion_score || 0,
                    criteria_score: submission.criteria_score || 0,
                    total_score: submission.total_score || 0,
                  } as ExtendedNovaSubmission;
                }),
            };
          }) || [],
      })),
    };

    return <ResultClient data={data} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    redirect('/challenges');
  }
}
