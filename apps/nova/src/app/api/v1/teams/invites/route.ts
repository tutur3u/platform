import { isEmail } from '@/utils/email-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

//Get all invitation for the current user
export async function GET() {
  const supabase = await createClient();

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
    const { data: invites, error } = await supabase
      .from('nova_team_emails')
      .select(`team_id, email, created_at, nova_teams(id, name, description)`)
      .eq('email', user.email);

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

// Create a new team invitation
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Get authenticated user (teh inviter)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamId, email } = body;

    if (!teamId || !email) {
      return NextResponse.json(
        { message: 'Team ID and email are required' },
        { status: 400 }
      );
    }

    if (!isEmail(email)) {
      return NextResponse.json(
        { message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if team exists
    const { data: team, error: teamError } = await supabase
      .from('nova_teams')
      .select('id')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      console.error('Team not found:', teamError);
      return NextResponse.json({ message: 'Team not found' }, { status: 404 });
    }

    // Check if invitation already exists
    const { data: existingInvite } = await supabase
      .from('nova_team_emails')
      .select('email')
      .eq('team_id', teamId)
      .eq('email', email)
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { message: 'Invitation already exists' },
        { status: 400 }
      );
    }

    // Create new invitation
    const { error: inviteError } = await supabase
      .from('nova_team_emails')
      .insert({
        team_id: teamId,
        email: email,
      });

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      throw inviteError;
    }

    return NextResponse.json(
      {
        message: 'Invitation sent successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json(
      { message: 'Failed to create invitation', error: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get query params for single invitation deletion
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    const email = searchParams.get('email');

    if (!teamId || !email) {
      return NextResponse.json(
        { message: 'Team ID and email are required' },
        { status: 400 }
      );
    }

    // Check if invitation exists
    const { data: invitation, error: inviteCheckError } = await supabase
      .from('nova_team_emails')
      .select('*')
      .eq('team_id', teamId)
      .eq('email', email)
      .maybeSingle();

    if (inviteCheckError || !invitation) {
      return NextResponse.json(
        { message: 'Invitation not found' },
        { status: 404 }
      );
    }
    // Delete the invitation
    const { error: deleteError } = await supabase
      .from('nova_team_emails')
      .delete()
      .eq('team_id', teamId)
      .eq('email', email);

    if (deleteError) {
      console.error('Error deleting invitation:', deleteError);
      return NextResponse.json(
        { message: 'Failed to delete invitation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Invitation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting invitation:', error);
    return NextResponse.json(
      { message: 'Failed to delete invitation', error: String(error) },
      { status: 500 }
    );
  }
}

// Accept/decline invitation
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

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
    const { data: invite, error: inviteError } = await supabase
      .from('nova_team_emails')
      .select('*')
      .eq('team_id', teamId)
      .eq('email', user.email)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { message: 'Invitation not found or already processed' },
        { status: 404 }
      );
    }

    //Use transaction to ensure data consistency
    if (action === 'accept') {
      // Add user to team members
      const { error: memberError } = await supabase
        .from('nova_team_members')
        .insert({
          team_id: teamId,
          user_id: user.id,
        });

      // Update invite status
      const { error: updateError } = await supabase
        .from('nova_team_emails')
        .delete()
        .eq('team_id', teamId)
        .eq('email', user.email);

      if (updateError) {
        console.error('Error updating invitation status:', updateError);
        throw updateError;
      }

      if (memberError) {
        // Rollback invite status if member creation fails
        await supabase.from('nova_team_emails').insert({
          team_id: teamId,
          email: user.email,
        });

        console.error('Error adding user to team:', memberError);
        throw memberError;
      }
      return NextResponse.json({ message: 'Invitation accepted successfully' });
    } else {
      // Decline invitation
      const { error: declineError } = await supabase
        .from('nova_team_emails')
        .delete()
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
