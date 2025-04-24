import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();
  const { teamId } = await params;

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user is a system admin
    const { data: adminUser } = await sbAdmin
      .from('nova_roles')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();

    const isAdmin = adminUser?.allow_challenge_management;
    // Only admins can view team invitations
    if (!isAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to view this team' },
        { status: 403 }
      );
    }

    // Fetch invitations for the team
    const { data: invitations, error: inviteError } = await sbAdmin
      .from('nova_team_emails')
      .select('*')
      .eq('team_id', teamId);

    if (inviteError) {
      console.error('Error fetching invitations:', inviteError);
      return NextResponse.json(
        { message: 'Failed to fetch invitations', error: String(inviteError) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Invitations retrieved successfully',
      data: invitations,
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { message: 'Server error', error: String(error) },
      { status: 500 }
    );
  }
}
