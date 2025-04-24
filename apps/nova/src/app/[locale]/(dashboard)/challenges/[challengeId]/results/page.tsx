import ResultClient from './client';
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
    const { data: sessionSummaries } = await sbAdmin
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!sessionSummaries) {
      throw new Error('Sessions not found');
    }

    // Get problem count for this challenge
    const { count: problemCount } = await sbAdmin
      .from('nova_problems')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId);

    const { data: challengeStats, error: statsError } = await sbAdmin.rpc(
      'get_challenge_stats',
      {
        challenge_id_param: challengeId,
        user_id_param: user.id,
      }
    );

    if (statsError) {
      throw new Error('Error from fetching stats');
    }

    // Extract the first (and only) row from the results array
    const statsRow = challengeStats?.[0];

    // Calculate overall statistics
    const totalScore = statsRow?.total_score || 0;
    const maxPossibleScore = (problemCount || 0) * 10; // Assuming 10 points per problem
    const percentage =
      maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
    const problemsAttempted = statsRow?.problems_attempted || 0;

    const stats = {
      score: totalScore,
      maxScore: maxPossibleScore,
      percentage,
      problemsAttempted,
      totalProblems: problemCount || 0,
    };

    console.log('stat', stats);

    return (
      <ResultClient
        challengeId={challengeId}
        challenge={challenge}
        sessionSummaries={sessionSummaries}
        stats={stats}
        userId={user.id}
      />
    );
  } catch (error) {
    console.error('Error fetching data:', error);
    redirect('/challenges');
  }
}
