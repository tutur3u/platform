import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Users } from '@tuturuuu/ui/icons';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { id } = await params;

    const { data, error } = await supabase
      .from('nova_teams')
      .select('*, nova_team_members(count), nova_team_emails(count)')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const transformedData = {
      ...data,
      member_count: data.nova_team_members?.[0]?.count || 0,
      invitation_count: data.nova_team_emails?.[0]?.count || 0,
    };

    return NextResponse.json({ data: transformedData });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await createClient();

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { data: userRole, error: roleError } = await client
      .from('nova_roles')
      .select('allow_role_management')
      .eq('email', user.email)
      .single();

    if (roleError) {
      console.error('Error checking user permissions:', roleError);
      return NextResponse.json(
        { error: 'Failed to verify permissions' },
        { status: 500 }
      );
    }

    const isRoleAdmin = userRole?.allow_role_management;

    if (!isRoleAdmin) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = await createAdminClient();

    const { id } = await params;
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from('nova_teams')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating team:', error);
    return NextResponse.json(
      { error: 'Failed to update team' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { id } = await params;

    const { error } = await supabase.from('nova_teams').delete().eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      { error: 'Failed to delete team' },
      { status: 500 }
    );
  }
}
