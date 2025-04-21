interface TeamInvitation {
  team_id: string;
  status: string;
  created_at: string;
  nova_teams: {
    id: string;
    name: string;
    description: string | null;
  };
}

export const fetchTeamInvitations = async (): Promise<TeamInvitation[]> => {
  const response = await fetch('/api/v1/teams/invites');

  if (!response.ok) {
    throw new Error('Failed to fetch invitations');
  }
  return response.json();
};

// Function to respond to an invitation
export const respondToInvitation = async ({
  teamId,
  action,
}: {
  teamId: string;
  action: 'accept' | 'decline';
}) => {
  const response = await fetch('/api/v1/teams/invites', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ teamId, action }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to process invitation');
  }

  return response.json();
};
