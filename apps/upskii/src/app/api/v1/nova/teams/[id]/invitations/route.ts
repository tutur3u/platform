import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { id } = await params;

    // First, check if the team exists
    const { error: teamError } = await supabase
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get team invitations
    const { data, error, count } = await supabase
      .from('nova_team_emails')
      .select('*', { count: 'exact' })
      .eq('team_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('Error fetching team invitations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team invitations' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { id } = await params;
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if the team exists
    const { error: teamError } = await supabase
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from('nova_team_emails')
      .select('*')
      .eq('team_id', id)
      .eq('email', email)
      .single();

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation already exists for this email' },
        { status: 400 }
      );
    }

    // Add invitation
    const { data, error } = await supabase
      .from('nova_team_emails')
      .insert([{ team_id: id, email }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    const sbAdmin = await createAdminClient();

    // Check if a user with this email exists and add them to the team
    const { data: user } = await sbAdmin
      .from('user_private_details')
      .select('id:user_id')
      .eq('email', email)
      .single();

    if (user) {
      // Check if they're already a team member
      const { data: existingMember } = await supabase
        .from('nova_team_members')
        .select('*')
        .eq('team_id', id)
        .eq('user_id', user.id)
        .single();

      if (!existingMember) {
        // Add them to the team
        await supabase
          .from('nova_team_members')
          .insert([{ team_id: id, user_id: user.id }]);
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error adding team invitation:', error);
    return NextResponse.json(
      { error: 'Failed to add team invitation' },
      { status: 500 }
    );
  }
}
