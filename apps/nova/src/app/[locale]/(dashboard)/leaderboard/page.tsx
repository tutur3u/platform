import LeaderboardClient from './client';
import { LeaderboardEntry, UserInterface } from './leaderboard';
import { DEV_MODE } from '@/constants/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { redirect } from 'next/navigation';

async function fetchIndividualLeaderboard(locale: string, page: number = 1) {
  const limit = 100; // Same as original API
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
    return { data: [], challenges: [], problems: [], hasMore: false };
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
    return { data: [], challenges: [], problems: [], hasMore: false };
  }

  // Fetch all problems to get challenge association
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    console.error('Error fetching problems:', problemsError.message);
    return { data: [], challenges: [], problems: [], hasMore: false };
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
    return { data: [], challenges: [], problems: [], hasMore: false };
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
  const sortedData = groupedData.sort((a, b) => b.score - a.score);

  // Add rank
  const rankedData = sortedData.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  // Paginate
  const paginatedData = rankedData.slice((page - 1) * limit, page * limit);

  return {
    data: paginatedData,
    challenges: challenges || [],
    problems: problemsData || [],
    hasMore: rankedData.length > page * limit,
  };
}

async function fetchTeamLeaderboard(page: number = 1) {
  const limit = 50; // Same as original API
  const sbAdmin = await createAdminClient();

  // 1. Get all team members + their teams
  const { data: teamData, error: teamError } = await sbAdmin.from(
    'nova_team_members'
  ).select(`
    team_id,
    user_id,
    nova_teams (
      id,
      name
    ),
    users!inner (
      display_name,
      avatar_url
    )
  `);

  if (teamError) {
    console.error('Error fetching team data:', teamError.message);
    return { data: [], challenges: [], problems: [], hasMore: false };
  }

  // 2. Get all scores with detail for proper calculation
  const { data: submissionsData, error: submissionsError } = await sbAdmin.from(
    'nova_submissions_with_scores'
  ).select(`
    id,
    user_id,
    problem_id,
    total_score,
    session_id,
    nova_sessions!inner(challenge_id)
  `);

  if (submissionsError) {
    console.error('Error fetching submissions:', submissionsError.message);
    return { data: [], challenges: [], problems: [], hasMore: false };
  }

  // Fetch all problems to get challenge association
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    console.error('Error fetching problems:', problemsError.message);
    return { data: [], challenges: [], problems: [], hasMore: false };
  }

  // Create a map of problem_id to challenge_id for easy lookup
  const problemChallengeMap = new Map<string, string>();
  const problemTitleMap = new Map<string, string>();
  problemsData?.forEach((problem) => {
    if (problem.id) {
      if (problem.challenge_id) {
        problemChallengeMap.set(problem.id, problem.challenge_id);
      }
      problemTitleMap.set(
        problem.id,
        problem.title || `Problem ${problem.id.substring(0, 8)}`
      );
    }
  });

  // 3. Group submissions by user and calculate proper scores
  const userChallengeScores: Record<string, Record<string, number>> = {};
  // Track user problem scores by problem ID
  const userProblemScores: Record<
    string,
    Record<string, { id: string; title: string; score: number }>
  > = {};

  // First process all submissions to get best scores per problem per user
  const userProblemBestScores = new Map<string, Map<string, number>>();

  if (submissionsData) {
    for (const submission of submissionsData) {
      const userId = submission.user_id;
      const problemId = submission.problem_id;
      if (!userId || !problemId) continue;

      const correctScore = submission.total_score || 0;

      // Initialize user's map if not exists
      if (!userProblemBestScores.has(userId)) {
        userProblemBestScores.set(userId, new Map());
      }

      const userScores = userProblemBestScores.get(userId);
      if (!userScores) continue;

      // Keep only the best score for each problem
      if (
        !userScores.has(problemId) ||
        (userScores.get(problemId) || 0) < correctScore
      ) {
        userScores.set(problemId, correctScore);

        // Get problem title
        const problemTitle =
          problemTitleMap.get(problemId) ||
          `Problem ${problemId.substring(0, 8)}`;

        // Get challenge ID
        const challengeId = problemChallengeMap.get(problemId);
        if (!challengeId) continue;

        // Initialize problem scores for user if not exists
        if (!userProblemScores[userId]) {
          userProblemScores[userId] = {};
        }

        // Store problem score with details
        userProblemScores[userId][problemId] = {
          id: problemId,
          title: problemTitle,
          score: correctScore,
        };
      }
    }
  }

  // Now aggregate problem scores by challenge for each user
  for (const [userId, problemScores] of userProblemBestScores.entries()) {
    userChallengeScores[userId] = {};

    for (const [problemId, score] of problemScores.entries()) {
      const challengeId = problemChallengeMap.get(problemId);
      if (challengeId) {
        userChallengeScores[userId][challengeId] =
          (userChallengeScores[userId][challengeId] || 0) + score;
      }
    }
  }

  // 4. Group data by team
  const teamsMap = new Map<
    string,
    {
      teamName: string;
      members: UserInterface[];
      challenge_scores: Record<string, number>;
      problem_scores: Record<
        string,
        Array<{ id: string; title: string; score: number }>
      >;
      score: number;
      avatars: (string | null)[];
    }
  >();

  // Get all challenges
  const { data: challenges } = await sbAdmin
    .from('nova_challenges')
    .select('id, title');

  for (const member of teamData) {
    const teamId = member.team_id;
    const teamName = member.nova_teams?.name || '';
    const displayName = member.users?.display_name || '';
    const avatarUrl = member.users?.avatar_url;
    const userId = member.user_id;

    if (!teamId || !userId) continue;

    if (!teamsMap.has(teamId)) {
      teamsMap.set(teamId, {
        teamName,
        members: [],
        challenge_scores: {},
        problem_scores: {},
        score: 0,
        avatars: [],
      });
    }

    const team = teamsMap.get(teamId);
    if (!team) continue;

    team.members.push({
      id: userId,
      name: displayName,
      avatar: avatarUrl || '',
      role: 'member',
    });

    // Add user's challenge scores to team's challenge scores
    if (userChallengeScores[userId]) {
      for (const [challengeId, score] of Object.entries(
        userChallengeScores[userId]
      )) {
        team.challenge_scores[challengeId] =
          (team.challenge_scores[challengeId] || 0) + score;
      }
    }

    if (avatarUrl) {
      team.avatars.push(avatarUrl);
    }

    // Collect user's problem scores by challenge
    if (userProblemScores[userId]) {
      for (const [problemId, problemScore] of Object.entries(
        userProblemScores[userId]
      )) {
        if (!problemScore || !problemId) continue;

        const challengeId = problemChallengeMap.get(problemId);
        if (!challengeId) continue;

        if (!team.problem_scores[challengeId]) {
          team.problem_scores[challengeId] = [];
        }

        // Add the problem to the team's list for this challenge
        team.problem_scores[challengeId].push({
          id: problemId,
          title: problemScore.title,
          score: problemScore.score,
        });
      }
    }
  }

  // Calculate total score from challenge scores
  const teamsArray: LeaderboardEntry[] = [];
  for (const [teamId, team] of teamsMap.entries()) {
    // Calculate total score
    team.score = Object.values(team.challenge_scores).reduce(
      (sum, score) => sum + score,
      0
    );

    // Consolidate problem scores to prevent duplicates
    for (const challengeId in team.problem_scores) {
      const problemScores = team.problem_scores[challengeId];
      if (!problemScores) continue;

      // Create a Map to consolidate scores by problem ID
      const bestScores = new Map<
        string,
        { id: string; title: string; score: number }
      >();

      problemScores.forEach((problem) => {
        if (!problem || !problem.id) return;

        if (
          !bestScores.has(problem.id) ||
          bestScores.get(problem.id)!.score < problem.score
        ) {
          bestScores.set(problem.id, { ...problem });
        }
      });

      // Replace the array with the consolidated scores
      team.problem_scores[challengeId] = Array.from(bestScores.values());

      // Recalculate challenge scores based on consolidated problem scores
      team.challenge_scores[challengeId] = Array.from(
        bestScores.values()
      ).reduce((sum, problem) => sum + problem.score, 0);
    }

    // Recalculate total score after consolidation
    team.score = Object.values(team.challenge_scores).reduce(
      (sum, score) => sum + score,
      0
    );

    teamsArray.push({
      id: teamId,
      name: team.teamName,
      avatar: team.avatars[0] || '', // Use first member's avatar as team avatar
      member: team.members,
      score: team.score,
      challenge_scores: team.challenge_scores,
      problem_scores: team.problem_scores,
      rank: 0, // Placeholder, will be set after sorting
    });
  }

  // Sort by total score
  const sortedTeams = teamsArray.sort((a, b) => b.score - a.score);

  // Add ranks
  const rankedTeams = sortedTeams.map((team, index) => ({
    ...team,
    rank: index + 1,
  }));

  // Paginate
  const paginatedTeams = rankedTeams.slice((page - 1) * limit, page * limit);

  return {
    data: paginatedTeams,
    challenges: challenges || [],
    problems: problemsData || [],
    hasMore: rankedTeams.length > page * limit,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    isTeamMode?: string;
    page?: string;
    locale?: string;
  }>;
}) {
  // Match the original API implementation for access control
  const DISABLE_ACCESS = !DEV_MODE;
  if (DISABLE_ACCESS) redirect('/home');

  const locale = (await searchParams).locale || 'en';
  const isTeamMode = (await searchParams).isTeamMode === 'true';
  const page = parseInt((await searchParams).page || '1', 10);

  // Fetch data server-side based on the team mode
  const { data, challenges, problems, hasMore } = isTeamMode
    ? await fetchTeamLeaderboard(page)
    : await fetchIndividualLeaderboard(locale, page);

  return (
    <LeaderboardClient
      data={data}
      challenges={challenges}
      problems={problems}
      hasMore={hasMore}
      isChecked={isTeamMode}
      initialPage={page}
    />
  );
}
