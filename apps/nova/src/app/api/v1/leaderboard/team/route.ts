import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface UserInterface {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

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
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }

  // 2. Get all scores with detail for proper calculation
  const { data: submissionsData, error: submissionsError } = await sbAdmin.from(
    'nova_submissions_with_scores'
  ).select(`
    id, 
    user_id, 
    problem_id,
    total_tests,
    passed_tests,
    total_criteria,
    sum_criterion_score,
    nova_sessions!inner(challenge_id)
  `);

  if (submissionsError) {
    return NextResponse.json(
      { error: submissionsError.message },
      { status: 500 }
    );
  }

  // Fetch all problems to get challenge association
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    return NextResponse.json({ error: problemsError.message }, { status: 500 });
  }

  // Create a map of problem_id to challenge_id for easy lookup
  const problemChallengeMap = new Map();
  const problemTitleMap = new Map();
  problemsData?.forEach((problem) => {
    if (problem.id) {
      problemChallengeMap.set(problem.id, problem.challenge_id);
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

      // Calculate the score properly according to the formula
      const hasCriteria = (submission.total_criteria || 0) > 0;
      const hasTests = (submission.total_tests || 0) > 0;

      let criteriaScore = 0;
      if (hasCriteria) {
        const criteriaWeight = hasTests ? 0.5 : 1.0;
        criteriaScore =
          ((submission.sum_criterion_score || 0) /
            ((submission.total_criteria || 0) * 10)) *
          10 *
          criteriaWeight;
      }

      let testScore = 0;
      if (hasTests) {
        const testWeight = 0.5;
        testScore =
          ((submission.passed_tests || 0) / (submission.total_tests || 0)) *
          10 *
          testWeight;
      }

      const correctScore = criteriaScore + testScore;

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

  // Get all problems for UI
  const problemsForUI =
    problemsData?.map((problem) => ({
      id: problem.id || '',
      title: problem.title || '',
      challenge_id: problem.challenge_id || '',
    })) || [];

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
      avatar: avatarUrl,
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

    if (avatarUrl) {
      team.avatars.push(avatarUrl);
    }
  }

  // Calculate total score from challenge scores and consolidate problem scores
  for (const [_, team] of teamsMap.entries()) {
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
      const consolidatedScores = new Map<
        string,
        { id: string; title: string; score: number }
      >();

      problemScores.forEach((problem) => {
        if (!problem || !problem.id) return;

        if (!consolidatedScores.has(problem.id)) {
          consolidatedScores.set(problem.id, { ...problem });
        } else {
          const existing = consolidatedScores.get(problem.id);
          if (existing) {
            existing.score += problem.score;
          }
        }
      });

      // Replace the array with the consolidated scores
      team.problem_scores[challengeId] = Array.from(
        consolidatedScores.values()
      );
    }
  }

  // Convert the Map to an array for the final response
  const teamsArray = Array.from(teamsMap.entries())
    .map(([id, team]) => ({
      id,
      rank: 0, // Will be calculated after sorting
      name: team.teamName,
      avatar: team.avatars[0] || '',
      score: team.score,
      member: team.members,
      challenge_scores: team.challenge_scores,
      problem_scores: team.problem_scores,
    }))
    .sort((a, b) => b.score - a.score)
    .map((team, index) => ({
      ...team,
      rank: index + 1,
    }));

  // Paginate teams
  const paginatedTeams = teamsArray.slice(offset, offset + limit);
  const hasMore = offset + limit < teamsArray.length;

  return NextResponse.json({
    data: paginatedTeams,
    challenges: challenges || [],
    problems: problemsForUI,
    hasMore,
  });
}
