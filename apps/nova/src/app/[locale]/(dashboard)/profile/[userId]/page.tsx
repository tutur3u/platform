import UserProfileClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Dynamic metadata for profile pages
export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId: rawUserId } = await params;

  const locale = await getLocale();
  const sbAdmin = await createAdminClient();

  const userId = rawUserId
    .replace(/-/g, '')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

  // Fetch user data for metadata
  const { data: userData } = await sbAdmin
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  const userName =
    userData?.display_name || generateFunName({ id: userId, locale });

  // Construct OG image URL using userId
  const ogImageUrl = new URL(
    `/api/og/${userId}`,
    process.env.NEXT_PUBLIC_APP_URL || 'https://nova.tuturuuu.com'
  ).toString();

  return {
    title: `${userName}'s Profile | Nova`,
    description: `View ${userName}'s prompt engineering achievements, challenges, and leaderboard ranking on Nova.`,
    openGraph: {
      title: `${userName}'s Profile | Nova`,
      description: `View ${userName}'s prompt engineering achievements, challenges, and leaderboard ranking on Nova.`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${userName}'s Profile | Nova`,
      description: `View ${userName}'s prompt engineering achievements, challenges, and leaderboard ranking on Nova.`,
      images: [ogImageUrl],
    },
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: rawUserId } = await params;

  const locale = await getLocale();
  const sbAdmin = await createAdminClient();

  const userId = rawUserId
    .replace(/-/g, '')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

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
      created_at,
      nova_submissions_with_scores(id, total_score),
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
    .from('nova_submissions_with_scores')
    .select(
      `
      id,
      problem_id,
      total_score,
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
    sessionsData?.reduce((sum, session) => {
      // Get the total score from all submissions in this session
      const sessionsScores =
        session.nova_submissions_with_scores?.reduce(
          (subSum, submission) => subSum + (submission.total_score || 0),
          0
        ) || 0;
      return sum + sessionsScores;
    }, 0) || 0;

  // Group scores by challenge
  const challengeScores: Record<string, number> = {};
  if (sessionsData) {
    for (const session of sessionsData) {
      if (session.challenge_id) {
        // Calculate total score from submissions
        const sessionScore =
          session.nova_submissions_with_scores?.reduce(
            (subSum, submission) => subSum + (submission.total_score || 0),
            0
          ) || 0;

        challengeScores[session.challenge_id] =
          (challengeScores[session.challenge_id] || 0) + sessionScore;
      }
    }
  }

  // Get user's rank from leaderboard
  const { data: leaderboardData = [] } = await sbAdmin.from('nova_sessions')
    .select(`
      user_id,
      nova_submissions_with_scores(id, total_score)
    `);

  // Group by user and calculate total scores for ranking
  const userScores = leaderboardData?.reduce(
    (acc, curr) => {
      if (!acc[curr.user_id]) {
        acc[curr.user_id] = 0;
      }

      // Calculate total score from submissions
      const sessionScore =
        curr.nova_submissions_with_scores?.reduce(
          (subSum, submission) => subSum + (submission.total_score || 0),
          0
        ) || 0;

      acc[curr.user_id] = (acc[curr.user_id] || 0) + sessionScore;

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
    name: userData.display_name || generateFunName({ id: userData.id, locale }),
    avatar: userData.avatar_url || '',
    joinedDate: userData.created_at,
    totalScore,
    rank: userRank || 999, // Fallback rank if not found
    challengeCount: Object.keys(challengeScores).length,
    challengeScores,
    recentActivity:
      recentActivity?.map((activity) => ({
        id: activity.id || '',
        problemId: activity.problem_id || '',
        problemTitle: activity.nova_problems?.title || 'Unknown Problem',
        score: activity.total_score || 0,
        date: activity.created_at || '',
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
