import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50'),
      200
    );
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Fetch projects with separate queries to avoid TypeScript inference issues
    let projects: any, error: any;

    if (includeArchived) {
      const result = await supabase
        .from('projects')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      projects = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from('projects')
        .select('*')
        .eq('ws_id', wsId)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      projects = result.data;
      error = result.error;
    }

    if (error) throw error;

    // For now, return projects without time tracking stats since there's no direct relationship
    // In the future, this could be enhanced to show time tracking data via tasks associated with projects
    const projectsWithStats = projects?.map((project) => ({
      ...project,
      time_stats: {
        total_time_seconds: 0,
        total_time_formatted: '0s',
        user_time_seconds: 0,
        user_time_formatted: '0s',
        session_count: 0,
        user_session_count: 0,
      },
    }));

    return NextResponse.json({
      projects: projectsWithStats || [],
      pagination: {
        limit,
        offset,
        total: projects?.length || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching time tracking projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
