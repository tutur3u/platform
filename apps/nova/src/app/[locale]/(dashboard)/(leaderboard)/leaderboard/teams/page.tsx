import { BasicInformation } from '../components/basic-information-component';
import { LeaderboardEntry, UserInterface } from '../components/leaderboard';
import LeaderboardClient from './client';
import TeamsLeaderboardFallback from './fallback';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getLocale } from 'next-intl/server';
import { Suspense } from 'react';

export const revalidate = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
  }>;
}) {
  const locale = await getLocale();
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<TeamsLeaderboardFallback />}>
        <TeamsLeaderboardContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TeamsLeaderboardContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: Promise<{
    page?: string;
    challenge?: string;
  }>;
}) {
  const { page = '1', challenge = 'all' } = await searchParams;
  const pageNumber = parseInt(page, 10);

  const {
    data,
    topThree,
    basicInfo,
    challenges,
    problems,
    hasMore,
    totalPages,
  } = await fetchLeaderboard(pageNumber, challenge);

  return (
    <LeaderboardClient
      locale={locale}
      data={data}
      topThree={topThree}
      basicInfo={basicInfo}
      challenges={challenges}
      problems={problems}
      hasMore={hasMore}
      initialPage={pageNumber}
      totalPages={totalPages}
      calculationDate={new Date()}
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
async function fetchLeaderboard(page: number = 1, challengeId: string = 'all') {
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

  // Fetch all challenges for filter options
  const { data: challenges, error: challengesError } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title', { ascending: true });

  if (challengesError) {
    console.error('Error fetching challenges:', challengesError.message);
    return defaultData;
  }

  // Fetch problems
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    console.error('Error fetching problems:', problemsError.message);
    return defaultData;
  }

  // Filter problems if a specific challenge is selected
  let filteredProblems = problemsData;
  if (challengeId !== 'all') {
    filteredProblems = problemsData.filter(
      (problem) => problem.challenge_id === challengeId
    );
  }

  // Fetch team members for avatar display and member details
  const { data: teamMembersData, error: teamMembersError } = await sbAdmin.from(
    'nova_team_members'
  ).select(`
      team_id,
      user_id,
      users (
        display_name,
        avatar_url
      )
    `);

  if (teamMembersError) {
    console.error('Error fetching team members:', teamMembersError.message);
    return defaultData;
  }

  // Group team members by team
  const teamMembersMap = new Map<
    string,
    {
      members: UserInterface[];
      avatars: (string | null)[];
    }
  >();

  for (const member of teamMembersData) {
    if (!member.team_id || !member.user_id) continue;

    if (!teamMembersMap.has(member.team_id)) {
      teamMembersMap.set(member.team_id, {
        members: [],
        avatars: [],
      });
    }

    const team = teamMembersMap.get(member.team_id);
    if (!team) continue;

    const avatar = member.users?.avatar_url || null;

    team.members.push({
      id: member.user_id,
      name: member.users?.display_name || '',
      avatar: avatar || '',
      role: 'member',
    });

    if (avatar) {
      team.avatars.push(avatar);
    }
  }

  let rankedTeams: LeaderboardEntry[] = [];
  if (challengeId === 'all') {
    // Fetch team data from the team leaderboard view
    const { data: leaderboardData, error: leaderboardError } = await sbAdmin
      .from('nova_team_leaderboard')
      .select('*');

    if (leaderboardError) {
      console.error(
        'Error fetching team leaderboard:',
        leaderboardError.message
      );
      return defaultData;
    }

    // Transform data to match expected format
    rankedTeams = leaderboardData.map((team, index) => {
      const teamMembers = teamMembersMap.get(team.team_id || '') || {
        members: [],
        avatars: [],
      };

      return {
        id: team.team_id || '',
        rank: index + 1,
        name: team.name || '',
        avatar: teamMembers.avatars[0] || '', // Use first member's avatar as team avatar
        member: teamMembers.members,
        score: team.score || 0,
        challenge_scores:
          (team.challenge_scores as Record<string, number>) || {},
      };
    });
  } else {
    // Fetch team data for a specific challenge
    const { data: challengeLeaderboardData, error: challengeLeaderboardError } =
      await sbAdmin
        .from('nova_team_challenge_leaderboard')
        .select('*')
        .eq('challenge_id', challengeId);

    if (challengeLeaderboardError) {
      console.error(
        'Error fetching team challenge leaderboard:',
        challengeLeaderboardError.message
      );
      return defaultData;
    }

    // Transform data to match expected format
    rankedTeams = challengeLeaderboardData.map((team, index) => {
      const teamMembers = teamMembersMap.get(team.team_id || '') || {
        members: [],
        avatars: [],
      };

      const problem_scores: Record<
        string,
        { id: string; title: string; score: number }[]
      > = {};
      problem_scores[challengeId] = (team.problem_scores || []) as {
        id: string;
        title: string;
        score: number;
      }[];

      return {
        id: team.team_id || '',
        rank: index + 1,
        name: team.name || '',
        avatar: teamMembers.avatars[0] || '',
        member: teamMembers.members,
        score: team.score || 0,
        problem_scores,
      };
    });
  }

  // Sort by score to ensure proper ranking
  rankedTeams.sort((a, b) => {
    if (b.score === a.score) {
      return (a.name || '').localeCompare(b.name || '');
    }
    return (b.score || 0) - (a.score || 0);
  });

  // Update ranks after sorting
  rankedTeams.forEach((team, index) => {
    team.rank = index + 1;
  });

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
    basicInfo,
    challenges: challenges || [],
    problems: filteredProblems,
    hasMore: rankedTeams.length > page * limit,
    totalPages,
  };
}
