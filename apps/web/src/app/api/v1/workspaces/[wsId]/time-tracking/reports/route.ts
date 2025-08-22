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
    const type = url.searchParams.get('type') || 'summary';
    const range = url.searchParams.get('range') || 'week';
    const member = url.searchParams.get('member');

    // Determine date range
    const now = new Date();
    let startDate: Date;
    const endDate = now;

    switch (range) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    if (type === 'stats') {
      // Return report statistics
      const { data: sessions, error } = await supabase
        .from('time_tracking_sessions')
        .select(`
          duration_seconds,
          start_time,
          category_id,
          time_tracking_categories(name, color)
        `)
        .eq('ws_id', wsId)
        .eq('user_id', member || user.id)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .not('duration_seconds', 'is', null);

      if (error) throw error;

      // Calculate statistics
      const totalSeconds =
        sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
      const totalHours = Math.round((totalSeconds / 3600) * 100) / 100;
      const avgHoursPerDay =
        sessions?.length > 0
          ? Math.round(
              (totalHours /
                Math.ceil(
                  (endDate.getTime() - startDate.getTime()) /
                    (1000 * 60 * 60 * 24)
                )) *
                100
            ) / 100
          : 0;

      // Calculate productivity score (simplified - based on consistency)
      const daysWithSessions = new Set(
        sessions?.map((s) => new Date(s.start_time).toDateString()) || []
      ).size;
      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const productivityScore =
        totalDays > 0 ? Math.round((daysWithSessions / totalDays) * 100) : 0;

      // Calculate time distribution by category
      const categoryBreakdown: Record<string, number> = {};
      sessions?.forEach((session) => {
        const categoryName =
          session.time_tracking_categories?.name || 'Uncategorized';
        categoryBreakdown[categoryName] =
          (categoryBreakdown[categoryName] || 0) +
          (session.duration_seconds || 0);
      });

      // Convert to percentages
      const timeDistribution: Record<string, number> = {};
      if (totalSeconds > 0) {
        Object.entries(categoryBreakdown).forEach(([category, seconds]) => {
          timeDistribution[category] = Math.round(
            (seconds / totalSeconds) * 100
          );
        });
      }

      return NextResponse.json({
        totalHours,
        productivityScore,
        tasksCompleted: sessions?.length || 0,
        topPerformer: member || user.id, // Simplified for now
        avgHoursPerDay,
        teamEfficiency: productivityScore,
        timeDistribution,
      });
    }

    // Default report type - summary
    const { data: sessions, error } = await supabase
      .from('time_tracking_sessions')
      .select(`
        *,
        category:time_tracking_categories(name, color),
        task:tasks(name, description)
      `)
      .eq('ws_id', wsId)
      .eq('user_id', member || user.id)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .not('duration_seconds', 'is', null)
      .order('start_time', { ascending: false });

    if (error) throw error;

    // Generate summary report
    const totalTime =
      sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
    const sessionCount = sessions?.length || 0;
    const uniqueCategories = new Set(
      sessions?.map((s) => s.category_id).filter(Boolean)
    ).size;
    const uniqueTasks = new Set(sessions?.map((s) => s.task_id).filter(Boolean))
      .size;

    // Daily breakdown
    const dailyBreakdown: Record<string, { time: number; sessions: number }> =
      {};
    sessions?.forEach((session) => {
      const date = new Date(session.start_time).toDateString();
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = { time: 0, sessions: 0 };
      }
      dailyBreakdown[date].time += session.duration_seconds || 0;
      dailyBreakdown[date].sessions += 1;
    });

    const dailyData = Object.entries(dailyBreakdown).map(([date, data]) => ({
      date,
      time: Math.round(data.time / 60), // Convert to minutes
      sessions: data.sessions,
    }));

    return NextResponse.json({
      summary: {
        totalTime: Math.round(totalTime / 60), // Convert to minutes
        totalTimeFormatted: formatTime(totalTime),
        sessionCount,
        uniqueCategories,
        uniqueTasks,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
      dailyBreakdown: dailyData,
      sessions: sessions?.slice(0, 50) || [], // Limit to recent 50 sessions
    });
  } catch (error) {
    console.error('Error generating time tracking report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
