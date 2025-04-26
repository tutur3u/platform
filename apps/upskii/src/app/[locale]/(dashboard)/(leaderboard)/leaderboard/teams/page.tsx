import { BasicInformation } from '../components/basic-information-component';
import { LeaderboardEntry, UserInterface } from '../components/leaderboard';
import LeaderboardClient from './client';
import TeamsLeaderboardFallback from './fallback';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Suspense } from 'react';

export const revalidate = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    locale?: string;
  }>;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<TeamsLeaderboardFallback />}>
        <TeamsLeaderboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TeamsLeaderboardContent({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    locale?: string;
  }>;
}) {
  const { page = '1' } = await searchParams;
  const pageNumber = parseInt(page, 10);

  const {
    data,
    topThree,
    basicInfo,
    challenges,
    problems,
    hasMore,
    totalPages,
  } = await fetchLeaderboard(pageNumber);

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
    />
  );
}

// For each user, I track their scores by mapping user → problem → session → score
// For each team, I find the best score per problem across all team members by:
// - Taking the highest score for each problem from any session for each user
// - Then taking the highest of those scores across all team members
// These best problem scores become the "official" problem scores for the team
// Challenge scores are calculated by summing the official problem scores for that challenge
// The total team score is the sum of all challenge scores
async function fetchLeaderboard(page: number = 1) {
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
    return defaultData;
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

  // Get all challenges
  const { data: challenges } = await sbAdmin
    .from('nova_challenges')
    .select('id, title');

  // Process submissions to get best scores per problem per user and session
  // A map of user_id -> problem_id -> session_id -> score
  const userProblemSessionScores = new Map<
    string,
    Map<string, Map<string, number>>
  >();

  if (submissionsData) {
    for (const submission of submissionsData) {
      const userId = submission.user_id;
      const problemId = submission.problem_id;
      const sessionId = submission.session_id;

      if (!userId || !problemId || !sessionId) continue;

      const score = submission.total_score || 0;

      // Initialize maps if they don't exist
      if (!userProblemSessionScores.has(userId)) {
        userProblemSessionScores.set(userId, new Map());
      }

      const userScores = userProblemSessionScores.get(userId);
      if (!userScores) continue;

      if (!userScores.has(problemId)) {
        userScores.set(problemId, new Map());
      }

      const problemSessions = userScores.get(problemId);
      if (!problemSessions) continue;

      // Update the score for this session if it's higher
      if (
        !problemSessions.has(sessionId) ||
        problemSessions.get(sessionId)! < score
      ) {
        problemSessions.set(sessionId, score);
      }
    }
  }

  // Group data by team
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

  // Organize teams
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

    if (avatarUrl) {
      team.avatars.push(avatarUrl);
    }
  }

  // Calculate team scores based on the best score per problem across all members
  for (const [_teamId, team] of teamsMap.entries()) {
    // Track the best score per problem across all team members
    const teamBestProblemScores = new Map<string, number>();

    // For each team member
    for (const member of team.members) {
      const userId = member.id;
      const userScores = userProblemSessionScores.get(userId);
      if (!userScores) continue;

      // For each problem the user has scores for
      for (const [problemId, sessionScores] of userScores.entries()) {
        // Calculate the best score across all sessions for this problem
        let bestProblemScore = 0;
        for (const score of sessionScores.values()) {
          bestProblemScore = Math.max(bestProblemScore, score);
        }

        // Update the team's best score for this problem if this user's score is higher
        const currentBest = teamBestProblemScores.get(problemId) || 0;
        if (bestProblemScore > currentBest) {
          teamBestProblemScores.set(problemId, bestProblemScore);
        }
      }
    }

    // Calculate challenge scores based on the best problem scores
    const challengeScores: Record<string, number> = {};
    const problemScoresRecord: Record<
      string,
      Array<{ id: string; title: string; score: number }>
    > = {};

    // Organize problems by challenge and calculate challenge scores
    for (const [problemId, score] of teamBestProblemScores.entries()) {
      const challengeId = problemChallengeMap.get(problemId);
      if (!challengeId) continue;

      // Add to challenge score
      challengeScores[challengeId] =
        (challengeScores[challengeId] || 0) + score;

      // Add to problem scores for this challenge
      if (!problemScoresRecord[challengeId]) {
        problemScoresRecord[challengeId] = [];
      }

      problemScoresRecord[challengeId].push({
        id: problemId,
        title:
          problemTitleMap.get(problemId) ||
          `Problem ${problemId.substring(0, 8)}`,
        score: score,
      });
    }

    // Calculate total score as sum of all challenge scores
    const totalScore = Object.values(challengeScores).reduce(
      (sum, score) => sum + score,
      0
    );

    // Update the team record
    team.challenge_scores = challengeScores;
    team.problem_scores = problemScoresRecord;
    team.score = totalScore;
  }

  // Convert teams to array and format for LeaderboardEntry
  const teamsArray: LeaderboardEntry[] = [];
  for (const [teamId, team] of teamsMap.entries()) {
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
  const sortedTeams = teamsArray.sort((a, b) => {
    if (b.score === a.score) {
      return b.name.localeCompare(a.name);
    }
    return b.score - a.score;
  });

  // Add ranks
  const rankedTeams = sortedTeams.map((team, index) => ({
    ...team,
    rank: index + 1,
  }));

  const topThree = rankedTeams.slice(0, 3);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentRank = 0;

  if (user?.id) {
    const { data: teamMember } = await supabase
      .from('nova_team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (teamMember?.team_id) {
      const currentTeam = rankedTeams.find(
        (team) => team.id === teamMember.team_id
      );
      currentRank = currentTeam?.rank || 0;
    }
  }

  // Get basic info
  const basicInfo: BasicInformation = {
    currentRank: currentRank,
    topScore: rankedTeams[0]?.score || 0,
    archiverName: rankedTeams[0]?.name || '',
    totalParticipants: rankedTeams.length,
  };

  // Paginate
  const paginatedTeams = rankedTeams.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(rankedTeams.length / limit);

  return {
    data: paginatedTeams,
    topThree,
    basicInfo: basicInfo || {
      currentRank: 0,
      topScore: 0,
      archiverName: '',
      totalParticipants: 0,
    },
    challenges: challenges || [],
    problems: problemsData || [],
    hasMore: rankedTeams.length > page * limit,
    totalPages,
  };
}
