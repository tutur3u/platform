import ResultClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemCriteriaScore,
  NovaSession,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';

type ReportData = NovaSession & {
  challenge: NovaChallenge & {
    criteria: NovaChallengeCriteria[];
    problems: (NovaProblem & {
      criteria_scores: NovaProblemCriteriaScore[];
      submissions: NovaSubmission[];
    })[];
  };
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
    // Get session
    const { data: sessionData } = await sbAdmin
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sessionData) {
      redirect('/challenges');
    }

    if (sessionData.status === 'IN_PROGRESS') {
      redirect(`/challenges/${challengeId}`);
    }

    // Get challenge
    const { data: challengeData } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .maybeSingle();

    if (!challengeData) {
      throw new Error('Challenge not found');
    }

    // Get criteria
    const { data: criteriaData } = await sbAdmin
      .from('nova_challenge_criteria')
      .select('*')
      .eq('challenge_id', challengeId);

    // Get problems
    const { data: problemsData } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('challenge_id', challengeId);

    if (!problemsData) {
      throw new Error('Problems not found');
    }

    // Get criteria scores and submissions for each problem
    const problemsWithDetails = await Promise.all(
      problemsData.map(async (problem) => {
        const [criteriaScoresRes, submissionsRes] = await Promise.all([
          sbAdmin
            .from('nova_problem_criteria_scores')
            .select('*')
            .eq('problem_id', problem.id),
          sbAdmin
            .from('nova_submissions')
            .select('*')
            .eq('problem_id', problem.id),
        ]);

        return {
          ...problem,
          criteria_scores: criteriaScoresRes.data || [],
          submissions: submissionsRes.data || [],
        };
      })
    );

    const data: ReportData = {
      ...sessionData,
      challenge: {
        ...challengeData,
        criteria: criteriaData || [],
        problems: problemsWithDetails,
      },
    };

    return <ResultClient data={data} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    redirect('/challenges');
  }
}
