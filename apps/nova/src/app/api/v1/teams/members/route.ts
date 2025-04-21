import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

// Add this to the same file
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Parse query params for self-removal (leaving team)
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    // Or parse body for admin removing another member
    const { memberId, targetTeamId } = await request.json().catch(() => ({}));

    // Handle leaving team (self-removal)
    if (teamId) {
      const { error: leaveError } = await sbAdmin
        .from('nova_team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', user.id);

      if (leaveError) {
        console.error('Error leaving team:', leaveError);
        return NextResponse.json(
          { message: 'Failed to leave team' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'You have left the team' });
    }

    // Handle removing another member (admin action)
    if (targetTeamId && memberId) {
      const { data: adminUser } = await sbAdmin
        .from('nova_roles')
        .select('*')
        .eq('email', user.email)
        .eq('allow_challenge_management', true);

      const isAdmin = adminUser && adminUser.length > 0;

      if (!isAdmin) {
        return NextResponse.json(
          { message: 'You do not have permission to remove members' },
          { status: 403 }
        );
      }

      // Remove the member
      const { error: removeError } = await sbAdmin
        .from('nova_team_members')
        .delete()
        .eq('team_id', targetTeamId)
        .eq('user_id', memberId);

      if (removeError) {
        console.error('Error removing member:', removeError);
        return NextResponse.json(
          { message: 'Failed to remove team member' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'Member removed from team' });
    }

    return NextResponse.json(
      { message: 'Invalid request parameters' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Error managing team membership:', err);
    return NextResponse.json(
      { message: 'Failed to process request' },
      { status: 500 }
    );
  }
}
