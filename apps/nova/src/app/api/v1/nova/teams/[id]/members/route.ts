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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { error: roleError } = await supabase
      .from('platform_user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('allow_role_management', true)
      .single();

    if (roleError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();

    // Get team members with user information
    const { data, error, count } = await sbAdmin
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
  } catch (error) {
    console.error('Error fetching team members:', error);
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
    const supabase = await createClient();

    const { id } = await params;
    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
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

    // Check if member already exists in the team
    const { data: existingMember, error: memberError } = await supabase
      .from('nova_team_members')
      .select('*')
      .eq('team_id', id)
      .eq('user_id', user_id)
      .single();

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
    const { data, error } = await supabase
      .from('nova_team_members')
      .insert({ team_id: id, user_id })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json(
      { error: 'Failed to add team member' },
      { status: 500 }
    );
  }
}
