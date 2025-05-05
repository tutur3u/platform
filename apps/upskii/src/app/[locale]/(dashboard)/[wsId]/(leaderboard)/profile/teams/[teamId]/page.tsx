import { TeamProfile } from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

interface TeamData {
  id: string;
  name: string;
  description?: string;
  goals?: string;
  members: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    individual_score: number;
    contribution_percentage: number;
    join_date?: string;
  }[];
  rank?: number;
  total_score?: number;
  challenge_scores: Record<string, number>;
  challenge_details: Array<{ id: string; title: string; score: number }>;
  leaderboard_position?: {
    above?: { name: string; score: number }[];
    below?: { name: string; score: number }[];
  };
  stats?: {
    average_member_score: number;
    active_since?: string;
    weekly_progress?: number;
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ wsId: string, teamId: string }>;
}) {
  const { wsId, teamId: id } = await params;

  return (
    <Suspense
      fallback={<div className="p-8 text-center">Loading team data...</div>}
    >
      <TeamPageContent teamId={id} wsId={wsId} />
    </Suspense>
  );
}

async function TeamPageContent({ teamId, wsId }: { teamId: string, wsId: string }) {
  const teamData = await fetchTeamData(teamId);

  if (!teamData) {
    redirect(`/${wsId}/profile/teams`);
  }

  return <TeamProfile wsId={wsId} teamData={teamData} />;
}

async function fetchTeamData(id: string): Promise<TeamData | null> {
  try {
    const sbAdmin = await createAdminClient();

    // Fetch team members and team details
    const { data: teamData, error: teamError } = await sbAdmin
      .from('nova_team_members')
      .select(
        `
          user_id,
          team_id,
          created_at,
          nova_teams (
            id,
            name,
            description,
            goals,
            created_at
          ),
          users!inner (
            display_name,
            avatar_url
          )
        `
      )
      .eq('team_id', id);

    if (teamError || !teamData?.length) {
      console.error('Error fetching team data:', teamError?.message);
      return null;
    }

    // Fetch all challenges for challenge details
    const { data: challengesData, error: challengesError } = await sbAdmin
      .from('nova_challenges')
      .select('id, title')
      .order('title', { ascending: true });

    if (challengesError) {
      console.error('Error fetching challenges:', challengesError.message);
      return null;
    }

    // Fetch submission data with detailed scoring info
    const { data: submissionsData, error: submissionsError } =
      await sbAdmin.from('nova_submissions_with_scores').select(`
      id,
      user_id,
      problem_id,
      total_tests,
      passed_tests,
      total_criteria,
      sum_criterion_score,
      total_score,
      created_at,
      nova_sessions!inner(challenge_id),
      nova_problems(challenge_id)
    `);

    if (submissionsError) {
      console.error('Error fetching submissions:', submissionsError.message);
      return null;
    }

    // Fetch all problems to get challenge association
    const { data: problemsData, error: problemsError } = await sbAdmin
      .from('nova_problems')
      .select('id, challenge_id, title');

    if (problemsError) {
      console.error('Error fetching problems:', problemsError.message);
      return null;
    }

    // Create a map of problem_id to challenge_id for easy lookup
    const problemChallengeMap = new Map();
    const problemTitleMap = new Map();
    problemsData?.forEach((problem) => {
      problemChallengeMap.set(problem.id, problem.challenge_id);
      problemTitleMap.set(problem.id, problem.title);
    });

    // Create a map of challenge_id to challenge details
    const challengeMap = new Map();
    challengesData?.forEach((challenge) => {
      challengeMap.set(challenge.id, {
        id: challenge.id,
        title: challenge.title,
      });
    });

    // Fetch all team members to calculate ranks for all teams
    const { data: allTeamMembers, error: allTeamMembersError } = await sbAdmin
      .from('nova_team_members')
      .select('user_id, team_id');

    if (allTeamMembersError) {
      console.error(
        'Error fetching all team members:',
        allTeamMembersError.message
      );
      return null;
    }

    // Fetch all teams to get names for leaderboard context
    const { data: allTeams, error: allTeamsError } = await sbAdmin
      .from('nova_teams')
      .select('id, name');

    if (allTeamsError) {
      console.error('Error fetching all teams:', allTeamsError.message);
      return null;
    }

    // Process submissions to calculate user scores correctly
    const userProblemBestScores = new Map<string, Map<string, number>>();
    const userChallengeScores = new Map<string, Map<string, number>>();

    // First process all submissions to get best scores per problem per user
    submissionsData.forEach((submission) => {
      const userId = submission.user_id;
      const problemId = submission.problem_id;
      if (!userId || !problemId) return;

      // Calculate the score properly according to the formula
      const hasCriteria = (submission.total_criteria ?? 0) > 0;
      const hasTests = (submission.total_tests ?? 0) > 0;

      let criteriaScore = 0;
      if (hasCriteria) {
        const criteriaWeight = hasTests ? 0.5 : 1.0;
        criteriaScore =
          ((submission.sum_criterion_score ?? 0) /
            ((submission.total_criteria ?? 0) * 10)) *
          10 *
          criteriaWeight;
      }

      let testScore = 0;
      if (hasTests) {
        const testWeight = 0.5;
        testScore =
          ((submission.passed_tests ?? 0) / (submission.total_tests ?? 0)) *
          10 *
          testWeight;
      }

      const correctScore = criteriaScore + testScore;

      // Initialize user's map if not exists
      if (!userProblemBestScores.has(userId)) {
        userProblemBestScores.set(userId, new Map());
        userChallengeScores.set(userId, new Map());
      }

      const userProblems = userProblemBestScores.get(userId)!;

      // Keep only the best score for each problem
      if (
        !userProblems.has(problemId) ||
        userProblems.get(problemId)! < correctScore
      ) {
        userProblems.set(problemId, correctScore);

        // Also update the challenge score
        const challengeId = problemChallengeMap.get(problemId);
        if (challengeId) {
          const userChallenges = userChallengeScores.get(userId)!;
          const currentChallengeScore = userChallenges.get(challengeId) || 0;
          userChallenges.set(challengeId, currentChallengeScore + correctScore);
        }
      }
    });

    // Calculate total score for each user
    const userScores = new Map<string, number>();
    userChallengeScores.forEach((challengeScores, userId) => {
      const totalScore = Array.from(challengeScores.values()).reduce(
        (sum, score) => sum + score,
        0
      );
      userScores.set(userId, totalScore);
    });

    // Group scores by team and calculate total score for each team
    const teamScoresMap = new Map<string, number>();
    const teamMembersMap = new Map<string, string[]>();
    const teamChallengeScores = new Map<string, Map<string, number>>();

    // Initialize all teams with 0 score and empty members array
    allTeamMembers.forEach((member) => {
      if (!teamScoresMap.has(member.team_id)) {
        teamScoresMap.set(member.team_id, 0);
        teamMembersMap.set(member.team_id, []);
        teamChallengeScores.set(member.team_id, new Map());
      }
      teamMembersMap.get(member.team_id)?.push(member.user_id);
    });

    // Calculate scores for all teams
    allTeamMembers.forEach((member) => {
      const userId = member.user_id;
      const userScore = userScores.get(userId) || 0;

      // Add the user's score to the team's total score
      teamScoresMap.set(
        member.team_id,
        teamScoresMap.get(member.team_id)! + userScore
      );

      // Add user's challenge scores to team's challenge scores
      const userChallScores = userChallengeScores.get(userId);
      if (userChallScores) {
        const teamChallScores = teamChallengeScores.get(member.team_id)!;
        userChallScores.forEach((score, challengeId) => {
          const currentScore = teamChallScores.get(challengeId) || 0;
          teamChallScores.set(challengeId, currentScore + score);
        });
      }
    });

    // Create an array of teams and their scores to rank them
    const teamsWithScores = Array.from(teamScoresMap.entries()).map(
      ([teamId, score]) => {
        const teamName =
          allTeams.find((t) => t.id === teamId)?.name || 'Unknown Team';
        return {
          teamId,
          teamName,
          score,
        };
      }
    );

    // Sort teams based on total score (descending)
    teamsWithScores.sort((a, b) => b.score - a.score);

    // Now assign ranks to teams
    const rankMap = new Map<string, number>();
    teamsWithScores.forEach((team, index) => {
      rankMap.set(team.teamId, index + 1); // Rank starts at 1
    });

    // Get the actual team ID from the fetched data
    const actualTeamId = teamData[0]?.nova_teams.id;
    const currentTeamRank = rankMap.get(actualTeamId ?? '') || 0;
    const currentTeamScore = teamScoresMap.get(actualTeamId ?? '') || 0;

    // Get nearby teams in leaderboard for context
    const currentTeamIndex = teamsWithScores.findIndex(
      (t) => t.teamId === actualTeamId
    );
    const teamsAbove = teamsWithScores
      .slice(Math.max(0, currentTeamIndex - 2), currentTeamIndex)
      .map((t) => ({ name: t.teamName, score: t.score }));
    const teamsBelow = teamsWithScores
      .slice(currentTeamIndex + 1, currentTeamIndex + 3)
      .map((t) => ({ name: t.teamName, score: t.score }));

    // Calculate member individual scores and contribution percentages
    const teamMembers = teamData.map((member) => {
      const individualScore = userScores.get(member.user_id) || 0;
      const contributionPercentage =
        currentTeamScore > 0 ? (individualScore / currentTeamScore) * 100 : 0;

      return {
        user_id: member.user_id,
        display_name: member.users.display_name ?? '',
        avatar_url: member.users.avatar_url,
        individual_score: individualScore,
        contribution_percentage: parseFloat(contributionPercentage.toFixed(1)),
        join_date: member.created_at,
      };
    });

    // Sort members by individual score (highest first)
    teamMembers.sort((a, b) => b.individual_score - a.individual_score);

    // Get the team's challenge scores and format them for display
    const teamChallengeDetails: Array<{
      id: string;
      title: string;
      score: number;
    }> = [];
    const teamChallScores =
      teamChallengeScores.get(actualTeamId ?? '') || new Map();

    // Convert challenge scores to sorted array
    teamChallScores.forEach((score, challengeId) => {
      const challenge = challengeMap.get(challengeId);
      if (challenge) {
        teamChallengeDetails.push({
          id: challengeId,
          title: challenge.title,
          score,
        });
      }
    });

    // Sort by score (descending)
    teamChallengeDetails.sort((a, b) => b.score - a.score);

    // Calculate team stats
    const averageMemberScore =
      teamMembers.length > 0
        ? teamMembers.reduce(
            (sum, member) => sum + member.individual_score,
            0
          ) / teamMembers.length
        : 0;

    // Get when the team was created
    const teamCreatedAt = teamData[0]?.nova_teams.created_at;

    // Calculate weekly progress (dummy calculation - you'd want to implement proper logic)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISOString = oneWeekAgo.toISOString();

    const recentScores = submissionsData
      .filter(
        (score) =>
          score.created_at &&
          score.created_at > oneWeekAgoISOString &&
          teamMembersMap.get(actualTeamId ?? '')?.includes(score.user_id ?? '')
      )
      .reduce((sum, score) => sum + (score.total_score || 0), 0);

    // Prepare challenge scores record for the response
    const challenge_scores: Record<string, number> = {};
    teamChallScores.forEach((score, id) => {
      challenge_scores[id] = score;
    });

    return {
      id: actualTeamId ?? '',
      name: teamData[0]?.nova_teams?.name ?? '',
      description: teamData[0]?.nova_teams.description ?? undefined,
      goals: teamData[0]?.nova_teams.goals ?? undefined,
      members: teamMembers,
      rank: currentTeamRank,
      total_score: currentTeamScore,
      challenge_scores,
      challenge_details: teamChallengeDetails,
      leaderboard_position: {
        above: teamsAbove,
        below: teamsBelow,
      },
      stats: {
        average_member_score: parseFloat(averageMemberScore.toFixed(1)),
        active_since: teamCreatedAt,
        weekly_progress: recentScores,
      },
    };
  } catch (error) {
    console.error('Error in fetchTeamData:', error);
    return null;
  }
}
