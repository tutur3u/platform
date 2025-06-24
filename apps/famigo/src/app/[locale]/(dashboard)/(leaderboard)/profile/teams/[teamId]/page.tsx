import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import TeamClient, { type TeamData } from './client';

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
    return notFound();
  }

  return <TeamClient teamData={teamData} />;
}

async function fetchTeamData(id: string): Promise<TeamData | null> {
  try {
    const sbAdmin = await createAdminClient();

    // Fetch team from leaderboard to get score
    const { data: teamLeaderboardEntry, error: teamLeaderboardError } =
      await sbAdmin
        .from('nova_team_leaderboard')
        .select('*')
        .eq('team_id', id)
        .single();

    if (teamLeaderboardError) {
      console.error(
        'Error fetching team leaderboard entry:',
        teamLeaderboardError.message
      );
    }

    // Fetch all teams to calculate rank
    const { data: allTeams, error: allTeamsError } = await sbAdmin
      .from('nova_team_leaderboard')
      .select('team_id, score')
      .order('score', { ascending: false });

    if (allTeamsError || !allTeams) {
      console.error('Error fetching all teams:', allTeamsError.message);
    }

    // Calculate rank based on position in the leaderboard
    let teamRank: number | undefined;
    if (allTeams && allTeams.length > 0) {
      const teamIndex = allTeams.findIndex((team) => team.team_id === id);
      if (teamIndex !== -1) {
        teamRank = teamIndex + 1; // Add 1 because array is zero-indexed
      }
    }

    // Fetch team details
    const { data: teamDetails, error: teamDetailsError } = await sbAdmin
      .from('nova_teams')
      .select('id, name, description, goals, created_at')
      .eq('id', id)
      .single();

    if (teamDetailsError || !teamDetails) {
      console.error('Error fetching team details:', teamDetailsError?.message);
      return null;
    }

    // Fetch team members
    const { data: teamMembers, error: teamMembersError } = await sbAdmin
      .from('nova_team_members')
      .select(
        `
        user_id,
        created_at,
        users!inner (
          display_name,
          avatar_url
        )
      `
      )
      .eq('team_id', id);

    if (teamMembersError) {
      console.error('Error fetching team members:', teamMembersError.message);
      return null;
    }

    // Fetch team challenge scores
    const { data: teamChallengeScores, error: challengeScoresError } =
      await sbAdmin
        .from('nova_team_challenge_leaderboard')
        .select('challenge_id, score, nova_challenges(id, title)')
        .eq('team_id', id);

    if (challengeScoresError) {
      console.error(
        'Error fetching challenge scores:',
        challengeScoresError.message
      );
    }

    // Get individual member scores from user leaderboard
    const memberIds = teamMembers
      .map((member) => member.user_id)
      .filter(Boolean) as string[];

    const { data: memberScores, error: memberScoresError } = await sbAdmin
      .from('nova_user_leaderboard')
      .select('user_id, score')
      .in('user_id', memberIds);

    if (memberScoresError) {
      console.error('Error fetching member scores:', memberScoresError.message);
    }

    // Create a map of user_id to score
    const userScoresMap = new Map<string, number>();
    memberScores?.forEach((member) => {
      if (member.user_id) {
        userScoresMap.set(member.user_id, member.score || 0);
      }
    });

    // Calculate total team score
    const totalScore = teamLeaderboardEntry?.score || 0;

    // Calculate member contribution percentages
    const members = teamMembers.map((member) => {
      const individualScore = userScoresMap.get(member.user_id) || 0;
      const contributionPercentage =
        totalScore > 0 ? (individualScore / totalScore) * 100 : 0;

      return {
        user_id: member.user_id,
        display_name: member.users.display_name || '',
        avatar_url: member.users.avatar_url,
        individual_score: individualScore,
        contribution_percentage: parseFloat(contributionPercentage.toFixed(1)),
        join_date: member.created_at,
      };
    });

    // Sort members by individual score (highest first)
    members.sort((a, b) => b.individual_score - a.individual_score);

    // Format challenge details
    const challengeDetails =
      teamChallengeScores?.map((challenge) => ({
        id: challenge.challenge_id || '',
        title: challenge.nova_challenges?.title || 'Unknown Challenge',
        score: challenge.score || 0,
      })) || [];

    // Sort challenges by score (descending)
    challengeDetails.sort((a, b) => b.score - a.score);

    // Create challenge scores record
    const challengeScores: Record<string, number> = {};
    teamChallengeScores?.forEach((challenge) => {
      if (challenge.challenge_id) {
        challengeScores[challenge.challenge_id] = challenge.score || 0;
      }
    });

    // Calculate stats
    const averageMemberScore =
      members.length > 0
        ? members.reduce((sum, member) => sum + member.individual_score, 0) /
          members.length
        : 0;

    // Fetch recent submissions for weekly progress
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { data: recentSubmissions, error: recentSubmissionsError } =
      await sbAdmin
        .from('nova_submissions_with_scores')
        .select('total_score, user_id, created_at')
        .in('user_id', memberIds)
        .gte('created_at', oneWeekAgo.toISOString());

    if (recentSubmissionsError) {
      console.error(
        'Error fetching recent submissions:',
        recentSubmissionsError.message
      );
    }

    const weeklyProgress =
      recentSubmissions?.reduce(
        (sum, submission) => sum + (submission.total_score || 0),
        0
      ) || 0;

    return {
      id: teamDetails.id,
      name: teamDetails.name,
      description: teamDetails.description || undefined,
      goals: teamDetails.goals || undefined,
      members,
      rank: teamRank,
      total_score: totalScore,
      challenge_scores: challengeScores,
      challenge_details: challengeDetails,
      stats: {
        active_since: teamDetails.created_at,
        average_member_score: parseFloat(averageMemberScore.toFixed(1)),
        weekly_progress: weeklyProgress,
      },
    };
  } catch (error) {
    console.error('Error in fetchTeamData:', error);
    return null;
  }
}
