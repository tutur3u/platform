import LeaderboardClient from './client';
import { BasicInformation } from './components/basic-information-component';
import LeaderboardFallback from './fallback';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { Suspense } from 'react';

export const revalidate = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    wsId: string;
    page?: string;
    locale?: string;
  }>;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<LeaderboardFallback />}>
        <LeaderboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LeaderboardContent({
  searchParams,
}: {
  searchParams: Promise<{
    wsId: string;
    page?: string;
    locale?: string;
  }>;
}) {
  const { wsId, locale = 'en', page = '1' } = await searchParams;
  const pageNumber = parseInt(page, 10);

  const {
    data,
    topThree,
    basicInfo,
    challenges,
    problems,
    hasMore,
    totalPages,
  } = await fetchLeaderboard(locale, pageNumber);

  return (
    <LeaderboardClient
      data={data}
      topThree={topThree}
      basicInfo={basicInfo}
      challenges={challenges}
      problems={problems}
      hasMore={hasMore}
      initialPage={pageNumber}
      calculationDate={new Date()}
      totalPages={totalPages}
      wsId={wsId}
    />
  );
}

// The problem's score for each session is the maximum score of user's submissions for that problem in that session
// The challenge's score for each session is the sum of the problem's scores for that challenge in that session
// Then the official challenge score for each user is the maximum challenge score from any session
// The leaderboard score for each user is the sum of the official challenge scores for all challenges
async function fetchLeaderboard(locale: string, page: number = 1) {
  const defaultData = {
    data: [],
    topThree: [],
    basicInfo: {
      currentRank: 0,
      topScore: 0,
      archiverName: '',
      totalParticipants: 0,
    },
    challenges: [],
    problems: [],
    hasMore: false,
    totalPages: 0,
  };

  const limit = 20;
  const sbAdmin = await createAdminClient();

  // Fetch user sessions data
  const { data: sessionsData, error: sessionError } = await sbAdmin.from(
    'nova_sessions'
  ).select(`
    id,
    user_id,
    challenge_id,
    users!inner(
      display_name,
      avatar_url
    ),
    nova_challenges(
      id,
      title
    )
  `);

  if (sessionError) {
    console.error('Error fetching sessions:', sessionError.message);
    return defaultData;
  }

  // Fetch all scores from submissions with more detail
  const { data: submissionsData, error: submissionsError } = await sbAdmin.from(
    'nova_submissions_with_scores'
  ).select(`
    user_id,
    problem_id,
    total_score,
    session_id
  `);

  if (submissionsError) {
    console.error('Error fetching submissions:', submissionsError.message);
    return defaultData;
  }

  // Fetch all problems to get challenge association
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    console.error('Error fetching problems:', problemsError.message);
    return defaultData;
  }

  // Create a map of problem_id to challenge_id for easy lookup
  const problemChallengeMap = new Map<string, string>();
  problemsData?.forEach((problem) => {
    if (problem.id && problem.challenge_id) {
      problemChallengeMap.set(problem.id, problem.challenge_id);
    }
  });

  // Fetch all challenges for filtering options
  const { data: challenges } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title', { ascending: true });

  // Fetch whitelisted users
  const { data: whitelistedData, error: whitelistError } = await sbAdmin
    .from('nova_roles')
    .select('email')
    .eq('enabled', true);

  if (whitelistError) {
    console.error('Error fetching whitelisted users:', whitelistError.message);
    return defaultData;
  }

  // Group sessions by user
  const userSessions: Record<string, any> = sessionsData.reduce(
    (acc: Record<string, any>, session: any) => {
      if (!acc[session.user_id]) {
        acc[session.user_id] = {
          id: session.id,
          user_id: session.user_id,
          users: session.users,
          nova_challenges: session.nova_challenges,
          sessions: [],
        };
      }
      acc[session.user_id].sessions.push({
        id: session.id,
        challenge_id: session.challenge_id,
      });
      return acc;
    },
    {}
  );

  // Calculate scores from submissions and associate with sessions
  const groupedData = Object.values(userSessions).map((user: any) => {
    const userSubmissions = submissionsData.filter(
      (s) => s.user_id === user.user_id
    );

    // First, group submissions by problem_id to find the best submission for each problem
    const bestProblemSubmissions = new Map<string, any>();

    userSubmissions.forEach((submission) => {
      const problemId = submission.problem_id;
      if (!problemId) return;

      const sessionId = submission.session_id;
      if (!sessionId) return;

      const correctScore = submission.total_score || 0;

      // Keep only the best submission for each problem
      if (
        !bestProblemSubmissions.has(problemId) ||
        bestProblemSubmissions.get(problemId).score < correctScore
      ) {
        // Get problem title from problemsData
        const problemTitle =
          problemsData.find((p) => p.id === problemId)?.title ||
          `Problem ${problemId.substring(0, 8)}`;

        bestProblemSubmissions.set(problemId, {
          problemId,
          challengeId: problemChallengeMap.get(problemId),
          score: correctScore,
          title: problemTitle,
          sessionId,
        });
      }
    });

    // Group problems by session and challenge for accurate scoring
    const sessionScores = new Map<string, number>(); // Map<session_id, score>
    const challengeSessions = new Map<string, Set<string>>(); // Map<challenge_id, Set<session_id>>

    // Calculate session scores (sum of problem scores in each session)
    bestProblemSubmissions.forEach((problem) => {
      const { sessionId, score, challengeId } = problem;

      if (sessionId && challengeId) {
        // Add to session score
        sessionScores.set(
          sessionId,
          (sessionScores.get(sessionId) || 0) + score
        );

        // Track which sessions belong to which challenge
        if (!challengeSessions.has(challengeId)) {
          challengeSessions.set(challengeId, new Set());
        }
        challengeSessions.get(challengeId)?.add(sessionId);
      }
    });

    // Find max session score for each challenge
    const challenge_scores: Record<string, number> = {};
    challengeSessions.forEach((sessions, challengeId) => {
      let maxSessionScore = 0;
      sessions.forEach((sessionId: string) => {
        const sessionScore = sessionScores.get(sessionId) || 0;
        maxSessionScore = Math.max(maxSessionScore, sessionScore);
      });
      challenge_scores[challengeId] = maxSessionScore;
    });

    // Track individual problem scores for each challenge
    const problem_scores: Record<
      string,
      Array<{ id: string; title: string; score: number }>
    > = {};

    // Group problem scores by challenge
    bestProblemSubmissions.forEach((problem) => {
      const { challengeId, score, problemId, title } = problem;
      if (challengeId) {
        // Add to problem scores by challenge
        if (!problem_scores[challengeId]) {
          problem_scores[challengeId] = [];
        }

        problem_scores[challengeId].push({
          id: problemId,
          title,
          score,
        });
      }
    });

    // Total score is the sum of challenge scores (max session score per challenge)
    const total_score = Object.values(challenge_scores).reduce(
      (sum, score) => sum + score,
      0
    );

    return {
      id: user.user_id,
      name:
        user.users?.display_name ||
        generateFunName({ id: user.user_id, locale }),
      avatar: user.users?.avatar_url || null,
      score: total_score,
      challenge_scores,
      problem_scores,
    };
  });

  // Get existing user IDs for checking whitelisted users
  const existingUserIds = groupedData.map((entry) => entry.id);

  // Add whitelisted users (similar to route.ts implementation)
  if (whitelistedData?.length > 0) {
    const whitelistedEmails = whitelistedData
      .filter((user) => user.email)
      .map((user) => user.email);

    if (whitelistedEmails.length > 0) {
      // Get all user IDs in one query
      const { data: userDataBatch } = await sbAdmin
        .from('user_private_details')
        .select('user_id, email')
        .in('email', whitelistedEmails);

      // Get all user profiles in one query
      const userIds =
        userDataBatch
          ?.filter(
            (data) => data.user_id && !existingUserIds.includes(data.user_id)
          )
          .map((data) => data.user_id) || [];

      if (userIds.length > 0) {
        const { data: userProfiles } = await sbAdmin
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', userIds);

        // Map user profiles by their user ID
        const userProfileMap = new Map();
        userProfiles?.forEach((profile) => {
          userProfileMap.set(profile.id, profile);
        });

        // Add whitelisted users to grouped data
        userDataBatch?.forEach((userData) => {
          if (userData.user_id && !existingUserIds.includes(userData.user_id)) {
            const userProfile = userProfileMap.get(userData.user_id);
            if (userProfile) {
              groupedData.push({
                id: userData.user_id,
                name:
                  userProfile.display_name ||
                  generateFunName({ id: userData.user_id, locale }),
                avatar: userProfile.avatar_url || null,
                score: 0,
                challenge_scores: {},
                problem_scores: {},
              });
            }
          }
        });
      }
    }
  }

  // Sort by score
  const sortedData = groupedData.sort((a, b) => {
    if (b.score === a.score) {
      return b.name.localeCompare(a.name);
    }
    return b.score - a.score;
  });

  // Add rank
  const rankedData = sortedData.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  const topThree = rankedData.slice(0, 3);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUser = rankedData.find((entry) => entry.id === user?.id);

  // Get basic info
  const basicInfo: BasicInformation = {
    currentRank: currentUser?.rank || 0,
    topScore: rankedData[0]?.score || 0,
    archiverName: rankedData[0]?.name || '',
    totalParticipants: rankedData.length,
  };

  // Paginate
  const paginatedData = rankedData.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(rankedData.length / limit);

  return {
    data: paginatedData,
    topThree,
    basicInfo,
    challenges: challenges || [],
    problems: problemsData || [],
    hasMore: rankedData.length > page * limit,
    totalPages,
  };
}
