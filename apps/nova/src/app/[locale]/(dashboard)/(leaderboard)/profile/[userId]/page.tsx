import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import UserProfileClient, { type ProfileData } from './client';

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
    process.env.NEXT_PUBLIC_APP_URL || 'https://nova.ai.vn'
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

  // Fetch user from leaderboard for ranking and total score
  const { data: leaderboardEntry, error: leaderboardError } = await sbAdmin
    .from('nova_user_leaderboard')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (leaderboardError) {
    console.error(
      'Error fetching leaderboard entry:',
      leaderboardError.message
    );
  }

  // Get user's rank by querying all users ordered by score
  const { data: allUsers, error: allUsersError } = await sbAdmin
    .from('nova_user_leaderboard')
    .select('user_id, score')
    .order('score', { ascending: false });

  if (allUsersError) {
    console.error('Error fetching ranks:', allUsersError.message);
  }

  let userRank = 0;
  let nearbyRanks: {
    id: string;
    score: number;
    isCurrentUser: boolean;
  }[] = [];

  if (allUsers) {
    // Find user's position in the sorted array
    const userIndex = allUsers.findIndex((user) => user.user_id === userId);
    if (userIndex !== -1) {
      userRank = userIndex + 1;
    }

    // Get nearby ranks for display
    nearbyRanks = allUsers
      .slice(Math.max(0, userRank - 3), Math.min(allUsers.length, userRank + 2))
      .map((user) => ({
        id: user.user_id || userId, // Fallback to current userId if null
        score: user.score || 0,
        isCurrentUser: user.user_id === userId,
      }));
  }

  // Fetch challenge details for the user's participated challenges
  const challengeScores = (leaderboardEntry?.challenge_scores || {}) as Record<
    string,
    number
  >;
  const challengeIds = Object.keys(challengeScores);

  const { data: challengesRaw, error: challengesError } = await sbAdmin
    .from('nova_challenges')
    .select('id, title, description')
    .in('id', challengeIds.length > 0 ? challengeIds : ['none']);

  if (challengesError) {
    console.error('Error fetching challenges:', challengesError.message);
  }

  const challengesData = challengesRaw || [];

  // Fetch problems to calculate completion percentages
  const { data: problemsRaw, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id');

  if (problemsError) {
    console.error('Error fetching problems:', problemsError.message);
  }

  const problemsData = problemsRaw || [];

  // Map problems to challenges for completion stats
  const problemsByChallenge = problemsData.reduce(
    (acc, problem) => {
      const challengeId = problem.challenge_id || '';
      if (!acc[challengeId]) {
        acc[challengeId] = [];
      }
      acc[challengeId].push(problem.id);
      return acc;
    },
    {} as Record<string, string[]>
  );

  // Fetch problem scores for the user across all challenges
  const { data: challengeScoresRaw, error: challengeScoresError } =
    await sbAdmin
      .from('nova_user_challenge_leaderboard')
      .select('challenge_id, problem_scores')
      .eq('user_id', userId);

  if (challengeScoresError) {
    console.error(
      'Error fetching challenge scores:',
      challengeScoresError.message
    );
  }

  const userChallengeScores = challengeScoresRaw || [];

  // Create a map of problem IDs to scores
  const bestProblemScores: Map<string, { score: number; challengeId: string }> =
    new Map();
  userChallengeScores.forEach((challengeScore) => {
    const challengeId = challengeScore.challenge_id;
    if (!challengeId) return;

    const problemScores = Array.isArray(challengeScore.problem_scores)
      ? (challengeScore.problem_scores as { id: string; score: number }[])
      : [];

    problemScores.forEach((problem) => {
      if (problem && problem.id && typeof problem.score === 'number') {
        bestProblemScores.set(problem.id, {
          score: problem.score,
          challengeId,
        });
      }
    });
  });

  // Fetch recent activity
  const { data: recentActivityRaw, error: activityError } = await sbAdmin
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
    console.error('Error fetching recent activity:', activityError.message);
  }

  const recentActivity = recentActivityRaw || [];

  // Assemble ProfileData
  const challenges = challengesData.map((challenge) => {
    const challengeId = challenge.id;
    const problemsInChallenge = problemsByChallenge[challengeId] || [];
    const attemptedProblems = Array.from(bestProblemScores.entries()).filter(
      ([_, { challengeId: cid }]) => cid === challengeId
    ).length;

    return {
      id: challengeId,
      title: challenge.title,
      description: challenge.description,
      score: challengeScores[challengeId] || 0,
      problemCount: problemsInChallenge.length,
      attemptedProblems: attemptedProblems,
    };
  });

  const profileData: ProfileData = {
    id: userData.id,
    name: userData.display_name || generateFunName({ id: userData.id, locale }),
    avatar: userData.avatar_url || '',
    joinedDate: userData.created_at,
    totalScore: leaderboardEntry?.score || 0,
    rank: userRank,
    challengeCount: challengeIds.length,
    challengeScores,
    problemCount: bestProblemScores.size,
    totalAvailableProblems: problemsData.length,
    problemsAttemptedPercentage: problemsData.length
      ? (bestProblemScores.size / problemsData.length) * 100
      : 0,
    bestProblemScores: Array.from(bestProblemScores.entries()).map(
      ([id, { score, challengeId }]) => ({
        id,
        score,
        challengeId,
      })
    ),
    nearbyRanks,
    recentActivity: recentActivity.map((activity) => ({
      id: activity.id || '',
      problemId: activity.problem_id || '',
      problemTitle: activity.nova_problems?.title || 'Unknown Problem',
      score: activity.total_score || 0,
      date: activity.created_at || '',
    })),
    challenges,
  };

  return <UserProfileClient profile={profileData} />;
}
