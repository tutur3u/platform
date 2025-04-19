import { TeamProfile } from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import React from 'react';

interface TeamMember {
  user_id: string;
  role: string;
  nova_teams: {
    id: string;
    name: string;
  };
  users: {
    display_name: string;
    avatar_url: string | null;
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId: id } = await params;

  const teamData = await fetchTeamData(id);

  return <TeamProfile members={teamData} />;
}

async function fetchTeamData(id: string): Promise<TeamMember[]> {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('nova_team_members')
    .select(
      `
        user_id,
        nova_teams (
          id,
          name,
          description,
          goals
        ),
        users!inner (
          display_name,
          avatar_url
        )
      `
    )
    .eq('team_id', id);
  if (error) {
    console.error('Error fetching team data:', error.message);
    return [];
  }

  return data as unknown as TeamMember[];
}
