import ResultClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaSession,
  NovaSubmission,
  NovaSubmissionCriteria,
} from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';

type ExtendedNovaSubmission = NovaSubmission & {
  total_tests: number;
  passed_tests: number;
  test_case_score: number;
  criteria: (NovaChallengeCriteria & NovaSubmissionCriteria)[];
  total_criteria: number;
  sum_criterion_score: number;
  criteria_score: number;
  total_score: number;
};

type Results = {
  challenge: NovaChallenge;
  sessions: (NovaSession & {
    problems: (NovaProblem & {
      submissions: ExtendedNovaSubmission[];
    })[];
  })[];
};

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
          criteria:nova_submission_criteria(
            *,
            criteria:nova_challenge_criteria(*)
          )
        )
      `
      )
      .eq('challenge_id', challengeId);

    // Transform the data to match the expected structure
    const data: Results = {
      challenge: challenge as NovaChallenge,
      sessions: sessions.map((session) => ({
        ...session,
        problems:
          problems?.map((problem) => {
            // Explicitly define the problem type
            const typedProblem = problem as unknown as NovaProblem & {
              submissions: any[];
            };

            return {
              ...typedProblem,
              submissions: typedProblem.submissions
                .filter((submission) => submission.session_id === session.id)
                .map((submission) => {
                  // Map criteria to expected format
                  const criteria =
                    submission.criteria && Array.isArray(submission.criteria)
                      ? submission.criteria.map((criteriaItem: any) => ({
                          ...criteriaItem.criteria,
                          ...criteriaItem,
                        }))
                      : [];

                  // Return properly typed submission
                  return {
                    ...submission,
                    criteria,
                    total_tests: submission.total_tests || 0,
                    passed_tests: submission.passed_tests || 0,
                    test_case_score: submission.test_case_score || 0,
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
