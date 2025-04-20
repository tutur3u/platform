import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

//Get all invitation for the current user
export async function GET() {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Use the simplest possible select statement
    const { data: invites, error } = await sbAdmin
      .from('nova_team_invites')
      .select(
        `team_id, email, status,created_at, nova_teams(id, name, description)`
      )
      .eq('email', user.email)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching invitations:', error);
      return NextResponse.json(
        { message: 'Failed to fetch invitations', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(invites || []);
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { message: 'Server error', error: String(err) },
      { status: 500 }
    );
  }
}

// Accept/decline invitation
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamId, action } = body;

    if (!teamId || !action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        { message: 'Invalid request parameter' },
        { status: 400 }
      );
    }

    // Check if invitation exists and is for this user
    const { data: invite, error: inviteError } = await sbAdmin
      .from('nova_team_invites')
      .select('*')
      .eq('team_id', teamId)
      .eq('email', user.email)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { message: 'Invitation not found or already processed' },
        { status: 404 }
      );
    }

    //Use transaction to ensure data consistency
    if (action === 'accept') {
      // Update invite status

      const { error: updateError } = await sbAdmin
        .from('nova_team_invites')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('email', user.email);

      if (updateError) {
        console.error('Error updating invitation status:', updateError);
        throw updateError;
      }

      // Add user to team members

      const { error: memberError } = await sbAdmin
        .from('nova_team_members')
        .insert({
          team_id: teamId,
          user_id: user.id,
        });

      if (memberError) {
        // Rollback invite status if member creation fails
        await sbAdmin
          .from('nova_team_invites')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('team_id', teamId)
          .eq('email', user.email);

        console.error('Error adding user to team:', memberError);
        throw memberError;
      }
      return NextResponse.json({ message: 'Invitation accepted successfully' });
    } else {
      // Decline invitation
      const { error: declineError } = await sbAdmin
        .from('nova_team_invites')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('email', user.email);

      if (declineError) {
        console.error('Error declining invitation:', declineError);
        throw declineError;
      }

      return NextResponse.json({ message: 'Invitation declined successfully' });
    }
  } catch (error) {
    console.error('Error processing invitation:', error);
    return NextResponse.json(
      { message: 'Failed to process invitation' },
      { status: 500 }
    );
  }
}
