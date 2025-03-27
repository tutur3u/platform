import UserProfileClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

// Dynamic metadata for profile pages
export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const sbAdmin = await createAdminClient();

  // Fetch user data for metadata
  const { data: userData } = await sbAdmin
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  const userName = userData?.display_name || generateFunName(userId);

  return {
    title: `${userName}'s Profile | Nova`,
    description: `View ${userName}'s prompt engineering achievements, challenges, and leaderboard ranking on Nova.`,
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const sbAdmin = await createAdminClient();

  // Fetch user data
  const { data: userData, error: userError } = await sbAdmin
    .from('users')
    .select('id, display_name, avatar_url, created_at')
    .eq('id', userId)
    .single();

  if (userError || !userData) {
    return notFound();
  }

  // Fetch user's challenges and total score
  const { data: sessionsData = [], error: sessionsError } = await sbAdmin
    .from('nova_sessions')
    .select(
      `
      id,
      user_id,
      challenge_id,
      total_score,
      created_at,
      nova_challenges(
        id,
        title,
        description
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (sessionsError) {
    throw sessionsError;
  }

  // Fetch recent activity
  const { data: recentActivity = [], error: activityError } = await sbAdmin
    .from('nova_submissions')
    .select(
      `
      id,
      problem_id,
      score,
      created_at,
      nova_problems(
        id,
        title
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (activityError) {
    throw activityError;
  }

  // Calculate total score and best challenge
  const totalScore =
    sessionsData?.reduce(
      (sum, session) => sum + (session.total_score || 0),
      0
    ) || 0;

  // Group scores by challenge
  const challengeScores: Record<string, number> = {};
  if (sessionsData) {
    for (const session of sessionsData) {
      if (session.challenge_id) {
        challengeScores[session.challenge_id] =
          (challengeScores[session.challenge_id] || 0) +
          (session.total_score || 0);
      }
    }
  }

  // Get user's rank from leaderboard
  const { data: leaderboardData = [] } = await sbAdmin.from('nova_sessions')
    .select(`
      user_id,
      total_score
    `);

  // Group by user and calculate total scores for ranking
  const userScores = leaderboardData?.reduce(
    (acc, curr) => {
      if (!acc[curr.user_id]) {
        acc[curr.user_id] = 0;
      }

      acc[curr.user_id] = (acc[curr.user_id] || 0) + (curr.total_score || 0);

      return acc;
    },
    {} as Record<string, number>
  );

  // Convert to array and sort to determine rank
  const sortedUsers = Object.entries(userScores || {})
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  // Find user's position in the sorted array
  const userRank = sortedUsers.findIndex((user) => user.id === userId) + 1;

  // Format data for client component
  const profileData = {
    id: userData.id,
    name: userData.display_name || generateFunName(userData.id),
    avatar: userData.avatar_url || '',
    joinedDate: userData.created_at,
    totalScore,
    rank: userRank || 999, // Fallback rank if not found
    challengeCount: Object.keys(challengeScores).length,
    challengeScores,
    recentActivity:
      recentActivity?.map((activity) => ({
        id: activity.id,
        problemId: activity.problem_id,
        problemTitle: activity.nova_problems?.title || 'Unknown Problem',
        score: activity.score || 0,
        date: activity.created_at,
      })) || [],
    challenges:
      sessionsData?.reduce(
        (acc, session) => {
          if (
            session.nova_challenges &&
            !acc.some((c) => c.id === session.challenge_id)
          ) {
            acc.push({
              id: session.challenge_id,
              title: session.nova_challenges.title,
              description: session.nova_challenges.description,
              score: challengeScores[session.challenge_id] || 0,
            });
          }
          return acc;
        },
        [] as Array<{
          id: string;
          title: string;
          description: string;
          score: number;
        }>
      ) || [],
  };

  return <UserProfileClient profile={profileData} />;
}
