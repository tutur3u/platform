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
  params: Promise<{ teamId: string }>;
}) {
  const { teamId: id } = await params;

  return (
    <Suspense
      fallback={<div className="p-8 text-center">Loading team data...</div>}
    >
      <TeamPageContent teamId={id} />
    </Suspense>
  );
}

async function TeamPageContent({ teamId }: { teamId: string }) {
  const teamData = await fetchTeamData(teamId);

  if (!teamData) {
    redirect('/profile/teams');
  }

  return <TeamProfile teamData={teamData} />;
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

    // Now fetch scores for all teams to calculate ranks dynamically
    const { data: scoreData, error: scoreError } = await sbAdmin
      .from('nova_submissions')
      .select('user_id, score, created_at');

    if (scoreError) {
      console.error('Error fetching scores:', scoreError.message);
      return null;
    }

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

    // Calculate user scores
    const userScores = new Map<string, number>();
    scoreData.forEach((score) => {
      const userId = score.user_id;
      const currentScore = userScores.get(userId) || 0;
      userScores.set(userId, currentScore + (score.score || 0));
    });

    // Group scores by team and calculate total score for each team
    const teamScoresMap = new Map<string, number>();
    const teamMembersMap = new Map<string, string[]>();

    // Initialize all teams with 0 score and empty members array
    allTeamMembers.forEach((member) => {
      if (!teamScoresMap.has(member.team_id)) {
        teamScoresMap.set(member.team_id, 0);
        teamMembersMap.set(member.team_id, []);
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

    const recentScores = scoreData
      .filter(
        (score) =>
          score.created_at > oneWeekAgoISOString &&
          teamMembersMap.get(actualTeamId ?? '')?.includes(score.user_id)
      )
      .reduce((sum, score) => sum + (score.score || 0), 0);

    return {
      id: actualTeamId ?? '',
      name: teamData[0]?.nova_teams?.name ?? '',
      description: teamData[0]?.nova_teams.description ?? undefined,
      goals: teamData[0]?.nova_teams.goals ?? undefined,
      members: teamMembers,
      rank: currentTeamRank,
      total_score: currentTeamScore,
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
