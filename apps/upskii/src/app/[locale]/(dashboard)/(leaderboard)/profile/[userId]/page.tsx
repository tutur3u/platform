import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import {
  calculatePercentage,
  calculateScore,
} from '@tuturuuu/utils/nova/scores/calculate';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import UserProfileClient from './client';

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
  params: Promise<{ wsId: string; userId: string }>;
}) {
  const { wsId, userId: rawUserId } = await params;

  const locale = await getLocale();
  const sbAdmin = await createAdminClient();

  const userId = rawUserId
    .replace(/-/g, '')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

  // Fetch user data
  const { data: userData, error: userError } = await sbAdmin
    .from('users')
    .select('id, display_name, avatar_url, created_at, bio')
    .eq('id', userId)
    .single();

  if (userError || !userData) {
    return notFound();
  }

  // Fetch user's sessions with submissions
  const { data: sessionsData = [], error: sessionsError } = await sbAdmin
    .from('nova_sessions')
    .select(
      `
      id,
      user_id,
      challenge_id,
      created_at,
      nova_submissions_with_scores(
        id, 
        problem_id, 
        total_score,
        total_tests,
        passed_tests,
        total_criteria,
        sum_criterion_score
      ),
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

  // Fetch problems to get problem-challenge mapping
  const { data: problemsData = [] } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id');

  // Create a map of problem to challenge
  const problemChallengeMap = new Map();

  problemsData?.forEach((problem) => {
    problemChallengeMap.set(problem.id, problem.challenge_id);
  });

  // Fetch recent activity
  const { data: recentActivity = [], error: activityError } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select(
      `
      id,
      problem_id,
      total_score,
      total_tests,
      passed_tests,
      total_criteria,
      sum_criterion_score,
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

  // Process submissions to get best scores per problem
  const bestProblemScores = new Map<string, number>();
  const challengeScores: Record<string, number> = {};

  // Collect all submissions from all sessions
  const allSubmissions: any[] = [];

  sessionsData?.forEach((session) => {
    if (session.nova_submissions_with_scores) {
      session.nova_submissions_with_scores.forEach((submission: any) => {
        allSubmissions.push({
          ...submission,
          challenge_id: session.challenge_id,
        });
      });
    }
  });

  // Calculate best scores for each problem using the same formula as other parts of the app
  allSubmissions.forEach((submission) => {
    const problemId = submission.problem_id;
    if (!problemId) return;

    // Calculate the score properly according to the formula
    const correctScore = calculateScore({
      total_tests: submission.total_tests,
      passed_tests: submission.passed_tests,
      total_criteria: submission.total_criteria,
      sum_criterion_score: submission.sum_criterion_score,
    });

    // Get the existing best score for this problem, or 0 if none
    const currentBestScore = bestProblemScores.get(problemId) || 0;

    // If this submission has a higher score, update the best score
    if (correctScore > currentBestScore) {
      bestProblemScores.set(problemId, correctScore);

      // Update challenge score
      const challengeId =
        submission.challenge_id || problemChallengeMap.get(problemId);
      if (challengeId) {
        // Get current challenge score (sum of best problem scores for this challenge)
        const currentChallengeScore = challengeScores[challengeId] || 0;
        // Calculate score difference (new best - old best)
        const scoreDiff = correctScore - currentBestScore;
        // Update challenge score
        challengeScores[challengeId] = currentChallengeScore + scoreDiff;
      }
    }
  });

  // Calculate total score (sum of best scores for each problem)
  const totalScore = Array.from(bestProblemScores.values()).reduce(
    (sum, score) => sum + score,
    0
  );

  // Get user's rank from leaderboard
  const { data: leaderboardData = [] } = await sbAdmin
    .from('nova_sessions')
    .select(`
      user_id,
      nova_submissions_with_scores(
        id, 
        problem_id, 
        total_score,
        total_tests,
        passed_tests,
        total_criteria,
        sum_criterion_score
      )
    `);

  // Group by user and calculate total scores for ranking based on best score per problem
  const userScores: Record<string, number> = {};

  // Process all users' submissions to get best scores per problem
  leaderboardData?.forEach((session) => {
    if (!session.user_id) return;

    // Initialize user's record if not exists
    if (!userScores[session.user_id]) {
      userScores[session.user_id] = 0;
    }

    // Get user's best problem scores map
    const userBestScores = new Map<string, number>();

    // Process submissions using the same formula
    if (session.nova_submissions_with_scores) {
      session.nova_submissions_with_scores.forEach((sub: any) => {
        const problemId = sub.problem_id;
        if (!problemId) return;

        // Calculate the score with the formula
        const correctScore = calculateScore({
          total_tests: sub.total_tests,
          passed_tests: sub.passed_tests,
          total_criteria: sub.total_criteria,
          sum_criterion_score: sub.sum_criterion_score,
        });

        // Update best score for this problem
        const currentBest = userBestScores.get(problemId) || 0;
        if (correctScore > currentBest) {
          userBestScores.set(problemId, correctScore);
        }
      });
    }

    // Sum up best scores for this user
    let userTotalScore = 0;
    userBestScores.forEach((score) => {
      userTotalScore += score;
    });

    // Update user's total score
    userScores[session.user_id] = userTotalScore;
  });

  // Convert to array and sort to determine rank
  const sortedUsers = Object.entries(userScores)
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
    bio: userData.bio || 'No bio available',
    totalScore,
    rank: userRank || 999, // Fallback rank if not found
    challengeCount: Object.keys(challengeScores).length,
    challengeScores,
    // Additional stats for better UX/UI
    problemCount: bestProblemScores.size,
    totalAvailableProblems: problemsData?.length || 0,
    problemsAttemptedPercentage: problemsData?.length
      ? calculatePercentage(bestProblemScores.size, problemsData.length)
      : 0,
    bestProblemScores: Array.from(bestProblemScores.entries()).map(
      ([id, score]) => ({
        id,
        score,
        challengeId: problemChallengeMap.get(id),
      })
    ),
    nearbyRanks: sortedUsers
      .slice(
        Math.max(0, userRank - 3),
        Math.min(sortedUsers.length, userRank + 2)
      )
      .map((user) => ({
        id: user.id,
        score: user.score,
        isCurrentUser: user.id === userId,
      })),
    recentActivity:
      recentActivity?.map((activity) => {
        // Calculate score with the formula for recent activity display
        const correctScore = calculateScore({
          total_tests: activity.total_tests,
          passed_tests: activity.passed_tests,
          total_criteria: activity.total_criteria,
          sum_criterion_score: activity.sum_criterion_score,
        });

        return {
          id: activity.id || '',
          problemId: activity.problem_id || '',
          problemTitle: activity.nova_problems?.title || 'Unknown Problem',
          score: correctScore,
          date: activity.created_at || '',
        };
      }) || [],
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
              // Add problem count for this challenge
              problemCount:
                problemsData?.filter(
                  (p) => p.challenge_id === session.challenge_id
                ).length || 0,
              attemptedProblems: Array.from(bestProblemScores.entries()).filter(
                ([id]) => problemChallengeMap.get(id) === session.challenge_id
              ).length,
            });
          }
          return acc;
        },
        [] as Array<{
          id: string;
          title: string;
          description: string;
          score: number;
          problemCount: number;
          attemptedProblems: number;
        }>
      ) || [],
  };

  return <UserProfileClient wsId={wsId} profile={profileData} />;
}
