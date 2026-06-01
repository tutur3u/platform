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

    // Get team members with user information
    const { data, error, count } = await privateDb
      .from('nova_team_members')
      .select(
        `
        team_id,
        user_id,
        created_at,
        ...users(id, display_name, ...user_private_details(email))
      `,
        { count: 'exact' }
      )
      .eq('team_id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ data, count });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
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

    const { privateDb } = authorization.value;

    const { id } = await params;
    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
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

    // Check if member already exists in the team
    const { data: existingMember, error: memberError } = await privateDb
      .from('nova_team_members')
      .select('*')
      .eq('team_id', id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this team' },
        { status: 400 }
      );
    }

    // Add user to team
    const { data, error } = await privateDb
      .from('nova_team_members')
      .insert({ team_id: id, user_id })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: 'Failed to add team member' },
      { status: 500 }
    );
  }
}
