import { type NextRequest, NextResponse } from 'next/server';
import { authorizeNovaRoleManager } from '@/lib/nova-team-api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { privateDb } = authorization.value;

    const { id, userId } = await params;

    // Check if the team exists
    const { error: teamError } = await privateDb
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Remove user from team
    const { error } = await privateDb
      .from('nova_team_members')
      .delete()
      .eq('team_id', id)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove team member' },
      { status: 500 }
    );
  }
}
