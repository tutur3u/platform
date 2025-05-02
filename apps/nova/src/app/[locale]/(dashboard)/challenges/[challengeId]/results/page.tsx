import ResultClient from './client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { calculatePercentage } from '@tuturuuu/utils/nova/scores/calculate';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/server/user-helper';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;

  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const user = await getCurrentSupabaseUser();

  if (!user) redirect('/dashboard');

  try {
    // Get challenge - using the regular client since users can view their challenges
    const { data: challenge, error: challengeError } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (challengeError || !challenge) {
      console.error('Challenge fetch error:', challengeError);
      throw new Error('Challenge not found');
    }

    // Get sessions using regular client (user has permissions to their own sessions)
    const { data: sessionSummaries, error: sessionsError } = await supabase
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Sessions fetch error:', sessionsError);
      throw new Error('Error fetching sessions');
    }

    // Get challenge stats for this user through RPC (respect permissions)
    const { data: challengeStats, error: statsError } = await supabase.rpc(
      'get_challenge_stats',
      {
        challenge_id_param: challengeId,
        user_id_param: user.id,
      }
    );

    console.log('Challenge stats:', challengeStats);

    if (statsError) {
      console.error('Stats error:', statsError);
      throw new Error('Error fetching challenge statistics');
    }

    // Get problem count using the count parameter (more efficient)
    const { count: problemCount, error: countError } = await sbAdmin
      .from('nova_problems')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId);

    if (countError) {
      console.error('Problem count error:', countError);
      throw new Error('Error counting problems');
    }

    // Extract the first (and only) row from the results array
    const statsRow = challengeStats?.[0];

    // Calculate overall statistics
    // Total score should be the sum of best scores for each attempted problem
    const totalScore = statsRow?.total_score || 0;
    // Each problem is worth 10 points maximum
    const maxPossibleScore = (problemCount || 0) * 10;
    // Calculate percentage based on maximum possible score from all problems
    const percentage = calculatePercentage(totalScore, maxPossibleScore);
    const problemsAttempted = statsRow?.problems_attempted || 0;

    const stats = {
      score: totalScore,
      maxScore: maxPossibleScore,
      percentage,
      problemsAttempted,
      totalProblems: problemCount || 0,
    };

    console.log('Stats:', stats);

    return (
      <ResultClient
        challengeId={challengeId}
        challenge={challenge}
        sessionSummaries={sessionSummaries || []}
        stats={stats}
        userId={user.id}
      />
    );
  } catch (error) {
    console.error('Error fetching data:', error);
    redirect('/challenges');
  }
}
