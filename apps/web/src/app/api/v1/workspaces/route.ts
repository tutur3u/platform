import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all workspaces the user has access to
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select(
        'id, name, personal, avatar_url, logo_url, workspace_members!inner(user_id)'
      )
      .eq('workspace_members.user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching workspaces:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    // Transform data
    const transformedWorkspaces = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      personal: ws.personal,
      avatar_url: ws.avatar_url,
      logo_url: ws.logo_url,
    }));

    return NextResponse.json(transformedWorkspaces);
  } catch (error) {
    console.error('Error in workspaces API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
