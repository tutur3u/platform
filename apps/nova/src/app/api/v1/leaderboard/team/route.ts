import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface UserInterface {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
}

export async function GET(_req: NextRequest) {
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
    .from('nova_submissions')
    .select('user_id, score');

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
      .reduce((sum, s) => sum + (s.score ?? 0), 0);

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

  // 5. Sort & rank
  leaderboardArray.sort((a, b) => b.score - a.score);
  leaderboardArray.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return NextResponse.json({ data: leaderboardArray });
}
