import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

// Define the project type structure
interface Project {
  id: string;
  ws_id: string;
  name: string;
  description?: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: any; // Allow for additional properties
}

interface ProjectWithStats extends Project {
  time_stats: {
    total_time_seconds: number;
    total_time_formatted: string;
    user_time_seconds: number;
    user_time_formatted: string;
    session_count: number;
    user_session_count: number;
  };
}

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

    // Fetch projects using a more generic approach to avoid TypeScript issues
    let projects: Project[] = [];
    let error: any;

    try {
      // Use a simpler approach to avoid deep type instantiation
      const baseQuery = supabase
        .from('projects' as any)
        .select('*')
        .eq('ws_id', wsId);

      let result: any;
      if (includeArchived) {
        result = await baseQuery
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
      } else {
        result = await baseQuery
          .eq('archived', false)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
      }

      if (result.error) {
        error = result.error;
      } else {
        projects = (result.data as unknown as Project[]) || [];
      }
    } catch (dbError) {
      console.error('Database query error:', dbError);
      // Fallback to empty array if table doesn't exist
      projects = [];
      error = null;
    }

    if (error) throw error;

    // For now, return projects without time tracking stats since there's no direct relationship
    // In the future, this could be enhanced to show time tracking data via tasks associated with projects
    const projectsWithStats: ProjectWithStats[] = projects.map(
      (project: Project) => ({
        ...project,
        time_stats: {
          total_time_seconds: 0,
          total_time_formatted: '0s',
          user_time_seconds: 0,
          user_time_formatted: '0s',
          session_count: 0,
          user_session_count: 0,
        },
      })
    );

    return NextResponse.json({
      projects: projectsWithStats,
      pagination: {
        limit,
        offset,
        total: projects.length,
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
