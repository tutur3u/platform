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
  const limit = 20;
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

  // 2. Get all scores in one go
  const { data: scoreData, error: scoreError } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select('user_id, total_score');

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 });
  }

  // 3. Group data by team
  const teamsMap = new Map<
    string,
    {
      teamName: string;
      members: UserInterface[];
      score: number;
      avatars: (string | null)[];
    }
  >();

  for (const member of teamData) {
    const teamId = member.team_id;
    const teamName = member.nova_teams.name;
    const displayName = member.users.display_name;
    const avatarUrl = member.users.avatar_url;

    const score = scoreData
      .filter((s) => s.user_id === member.user_id)
      .reduce((sum, s) => sum + (s.total_score ?? 0), 0);

    if (!teamsMap.has(teamId)) {
      teamsMap.set(teamId, {
        teamName,
        members: [],
        score: 0,
        avatars: [],
      });
    }

    const team = teamsMap.get(teamId)!;

    team.members.push({
      id: member.user_id,
      name: displayName ?? '',
      avatar: avatarUrl,
      role: 'member',
    });

    team.score += score;
    team.avatars.push(avatarUrl);
  }

  // 4. Format to LeaderboardEntry[]
  const leaderboardArray = Array.from(teamsMap.entries()).map(
    ([teamId, teamData]) => ({
      id: teamId,
      name: teamData.teamName,
      avatar: teamData.avatars.find((a) => !!a) ?? '',
      member: teamData.members,
      score: teamData.score,
      rank: 0,
    })
  );

  // Sort and slice the data for pagination
  leaderboardArray.sort((a, b) => b.score - a.score);

  const totalCount = leaderboardArray.length;
  const hasMore = offset + limit < totalCount;
  const paginatedData = leaderboardArray.slice(offset, offset + limit);

  paginatedData.forEach((entry, index) => {
    entry.rank = offset + index + 1;
  });

  return NextResponse.json({
    data: paginatedData,
    hasMore,
  });
}
