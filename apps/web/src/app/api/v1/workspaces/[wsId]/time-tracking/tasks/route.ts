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
    const type = url.searchParams.get('type');
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50'),
      200
    );
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (type === 'stats') {
      // Return task statistics
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, completed, end_date, archived')
        .eq('ws_id', wsId)
        .eq('deleted', false);

      if (tasksError) throw tasksError;

      const now = new Date();
      const totalTasks = tasks?.length || 0;
      const completedTasks = tasks?.filter((t) => t.completed)?.length || 0;
      const inProgressTasks =
        tasks?.filter((t) => !t.completed && !t.archived)?.length || 0;
      const overdueTasks =
        tasks?.filter(
          (t) => !t.completed && t.end_date && new Date(t.end_date) < now
        )?.length || 0;

      return NextResponse.json({
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
      });
    }

    // Fetch tasks with time tracking data
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        task_lists!inner (
          id,
          name,
          status,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        ),
        assignees:task_assignees(
          user:users(
            id,
            display_name,
            avatar_url
          )
        )
      `)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false)
      .eq('archived', false)
      .in('task_lists.status', ['not_started', 'active'])
      .eq('task_lists.deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get time tracking data for these tasks
    const taskIds = tasks?.map((t) => t.id) || [];
    const timeTrackingData: Record<string, any> = {};

    if (taskIds.length > 0) {
      const { data: sessions } = await supabase
        .from('time_tracking_sessions')
        .select('task_id, duration_seconds')
        .in('task_id', taskIds)
        .not('duration_seconds', 'is', null);

      // Aggregate time data by task
      sessions?.forEach((session) => {
        if (session.task_id && session.duration_seconds) {
          if (!timeTrackingData[session.task_id]) {
            timeTrackingData[session.task_id] = {
              total_time_seconds: 0,
              session_count: 0,
            };
          }
          timeTrackingData[session.task_id].total_time_seconds +=
            session.duration_seconds;
          timeTrackingData[session.task_id].session_count += 1;
        }
      });
    }

    // Combine task data with time tracking stats
    const tasksWithTimeStats = tasks?.map((task) => ({
      ...task,
      time_stats: timeTrackingData[task.id] || {
        total_time_seconds: 0,
        total_time_formatted: '0s',
        session_count: 0,
      },
    }));

    // Format time for display
    tasksWithTimeStats?.forEach((task) => {
      if (task.time_stats.total_time_seconds > 0) {
        const hours = Math.floor(task.time_stats.total_time_seconds / 3600);
        const minutes = Math.floor(
          (task.time_stats.total_time_seconds % 3600) / 60
        );
        task.time_stats.total_time_formatted =
          hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }
    });

    return NextResponse.json({
      tasks: tasksWithTimeStats || [],
      pagination: {
        limit,
        offset,
        total: tasks?.length || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching time tracking tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
