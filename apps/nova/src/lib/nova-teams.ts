import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NovaTeam } from '@tuturuuu/types/db';

export type NovaTeamWithCounts = NovaTeam & {
  invitation_count: number;
  member_count: number;
};

function ensureCounts(teamIds: string[]) {
  return new Map<string, { invitation_count: number; member_count: number }>(
    teamIds.map((teamId) => [
      teamId,
      {
        invitation_count: 0,
        member_count: 0,
      },
    ])
  );
}

export async function withNovaTeamCounts(
  sbAdmin: TypedSupabaseClient,
  teams: NovaTeam[]
): Promise<NovaTeamWithCounts[]> {
  const teamIds = teams.map((team) => team.id);

  if (teamIds.length === 0) {
    return [];
  }

  const [membersResult, invitationsResult] = await Promise.all([
    sbAdmin
      .schema('private')
      .from('nova_team_members')
      .select('team_id')
      .in('team_id', teamIds),
    sbAdmin
      .schema('private')
      .from('nova_team_emails')
      .select('team_id')
      .in('team_id', teamIds),
  ]);

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (invitationsResult.error) {
    throw invitationsResult.error;
  }

  const countsByTeamId = ensureCounts(teamIds);

  for (const member of membersResult.data ?? []) {
    const counts = countsByTeamId.get(member.team_id);
    if (counts) counts.member_count += 1;
  }

  for (const invitation of invitationsResult.data ?? []) {
    const counts = countsByTeamId.get(invitation.team_id);
    if (counts) counts.invitation_count += 1;
  }

  return teams.map((team) => ({
    ...team,
    ...(countsByTeamId.get(team.id) ?? {
      invitation_count: 0,
      member_count: 0,
    }),
  }));
}
