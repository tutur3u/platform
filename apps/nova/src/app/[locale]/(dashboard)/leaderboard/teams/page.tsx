import { LeaderboardEntry, UserInterface } from '../components/leaderboard';
import LeaderboardClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

interface Props {
  searchParams: Promise<{
    page?: string;
    locale?: string;
  }>;
}

export default async function Page({ searchParams }: Props) {
  const { page = '1' } = await searchParams;
  const pageNumber = parseInt(page, 10);

  const { data, challenges, problems, hasMore } =
    await fetchLeaderboard(pageNumber);

  return (
    <LeaderboardClient
      data={data}
      challenges={challenges}
      problems={problems}
      hasMore={hasMore}
      initialPage={pageNumber}
    />
  );
}

async function fetchLeaderboard(page: number = 1) {
  const limit = 50;
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
