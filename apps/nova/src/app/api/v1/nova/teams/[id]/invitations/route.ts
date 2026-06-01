import { type NextRequest, NextResponse } from 'next/server';
import { authorizeNovaRoleManager } from '@/lib/nova-team-api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { privateDb } = authorization.value;

    const { id } = await params;

    // First, check if the team exists
    const { error: teamError } = await privateDb
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get team invitations
    const { data, error, count } = await privateDb
      .from('nova_team_emails')
      .select('*', { count: 'exact' })
      .eq('team_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data, count });
  } catch {
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
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { privateDb, sbAdmin } = authorization.value;

    const { id } = await params;
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if the team exists
    const { error: teamError } = await privateDb
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check if invitation already exists
    const { data: existingInvitation, error: invitationError } = await privateDb
      .from('nova_team_emails')
      .select('*')
      .eq('team_id', id)
      .eq('email', email)
      .maybeSingle();

    if (invitationError) {
      throw invitationError;
    }

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation already exists for this email' },
        { status: 400 }
      );
    }

    // Add invitation
    const { data, error } = await privateDb
      .from('nova_team_emails')
      .insert([{ team_id: id, email }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Check if a user with this email exists and add them to the team
    const { data: user } = await sbAdmin
      .from('user_private_details')
      .select('id:user_id')
      .eq('email', email)
      .single();

    if (user) {
      // Check if they're already a team member
      const { data: existingMember, error: memberError } = await privateDb
        .from('nova_team_members')
        .select('*')
        .eq('team_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }

      if (!existingMember) {
        // Add them to the team
        await privateDb
          .from('nova_team_members')
          .insert([{ team_id: id, user_id: user.id }]);
      }
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: 'Failed to add team invitation' },
      { status: 500 }
    );
  }
}
