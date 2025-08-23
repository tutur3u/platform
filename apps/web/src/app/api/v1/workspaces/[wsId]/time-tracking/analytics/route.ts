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
    const period = url.searchParams.get('period') || 'week';

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get basic session analytics
    const { data: sessions, error } = await supabase
      .from('time_tracking_sessions')
      .select(
        `
        *,
        category:time_tracking_categories(name, color),
        task:tasks(name, list_id, created_at)
      `
      )
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .gte('start_time', startDate.toISOString())
      .not('duration_seconds', 'is', null)
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Calculate basic metrics
    const totalSessions = sessions?.length || 0;
    const totalTime =
      sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
    const avgSessionLength =
      totalSessions > 0 ? Math.round(totalTime / totalSessions) : 0;

    // Category breakdown
    const categoryBreakdown = sessions?.reduce((acc: any, session) => {
      const categoryName = session.category?.name || 'Uncategorized';
      if (!acc[categoryName]) {
        acc[categoryName] = {
          name: categoryName,
          color: session.category?.color || 'GRAY',
          time: 0,
          sessions: 0,
        };
      }
      acc[categoryName].time += session.duration_seconds || 0;
      acc[categoryName].sessions += 1;
      return acc;
    }, {});

    // Daily breakdown
    const dailyBreakdown = sessions?.reduce((acc: any, session) => {
      const date = new Date(session.start_time).toISOString().split('T')[0];
      if (!date) return acc;
      if (!acc[date]) {
        acc[date] = { date, time: 0, sessions: 0 };
      }
      acc[date].time += session.duration_seconds || 0;
      acc[date].sessions += 1;
      return acc;
    }, {});

    // Weekly trends data (last 4 weeks)
    const weeklyData = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

      const weekSessions =
        sessions?.filter((s) => {
          const sessionDate = new Date(s.start_time);
          return sessionDate >= weekStart && sessionDate <= weekEnd;
        }) || [];

      const weekTime = weekSessions.reduce(
        (sum, s) => sum + (s.duration_seconds || 0),
        0
      );

      weeklyData.push({
        weekStart: weekStart.toISOString().split('T')[0],
        totalHours: Math.round((weekTime / 3600) * 100) / 100,
        sessions: weekSessions.length,
      });
    }

    // Active projects (unique tasks with time tracking)
    const activeProjects = new Set();
    const newThisWeek = new Set();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    sessions?.forEach((session) => {
      if (session.task?.name) {
        activeProjects.add(session.task.name);

        // Check if task was created this week
        if (
          session.task.created_at &&
          new Date(session.task.created_at) >= weekAgo
        ) {
          newThisWeek.add(session.task.name);
        }
      }
    });

    // Team members (workspace members)
    const { data: teamMembers } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId);

    // Productivity score calculation
    let productivityScore = 0;
    if (sessions && sessions.length > 0) {
      const focusScores = sessions.map((session) => {
        // Simple productivity calculation based on session length and category
        const duration = session.duration_seconds || 0;
        const isLongSession = duration >= 1800; // 30+ minutes
        const hasCategory = !!session.category_id;
        const hasTask = !!session.task_id;

        let score = 50; // Base score
        if (isLongSession) score += 20;
        if (hasCategory) score += 15;
        if (hasTask) score += 15;

        return Math.min(score, 100);
      });

      productivityScore = Math.round(
        focusScores.reduce((sum, score) => sum + score, 0) / focusScores.length
      );
    }

    // Activity heatmap data (hourly activity for the last 7 days)
    const heatmapData = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const dayDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dayName = days[dayDate.getDay()];

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = new Date(dayDate);
        hourStart.setHours(hour, 0, 0, 0);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

        const hourSessions =
          sessions?.filter((s) => {
            const sessionStart = new Date(s.start_time);
            const sessionEnd = new Date(s.start_time);
            if (s.duration_seconds) {
              sessionEnd.setSeconds(
                sessionEnd.getSeconds() + s.duration_seconds
              );
            }

            return sessionStart < hourEnd && sessionEnd > hourStart;
          }) || [];

        const hourTime = hourSessions.reduce(
          (sum, s) => sum + (s.duration_seconds || 0),
          0
        );

        heatmapData.push({
          day: dayName,
          hour: hour,
          time: hourTime,
          intensity: hourTime > 0 ? Math.min(hourTime / 3600, 1) : 0, // Normalize to 0-1
        });
      }
    }

    // Calculate percentage changes
    const previousPeriodStart = new Date(
      startDate.getTime() - (now.getTime() - startDate.getTime())
    );
    const { data: previousSessions } = await supabase
      .from('time_tracking_sessions')
      .select('duration_seconds')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .gte('start_time', previousPeriodStart.toISOString())
      .lt('start_time', startDate.toISOString())
      .not('duration_seconds', 'is', null);

    const previousPeriodTime =
      previousSessions?.reduce(
        (sum, s) => sum + (s.duration_seconds || 0),
        0
      ) || 0;
    const currentPeriodTime = totalTime;

    let timeChange = 0;
    if (previousPeriodTime > 0) {
      timeChange =
        ((currentPeriodTime - previousPeriodTime) / previousPeriodTime) * 100;
    }

    return NextResponse.json({
      analytics: {
        overview: {
          totalSessions,
          totalTime,
          avgSessionLength,
          period,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        },
        categoryBreakdown: Object.values(categoryBreakdown || {}),
        dailyBreakdown: Object.values(dailyBreakdown || {}),
        weeklyData,
        activeProjects: Array.from(activeProjects),
        newProjects: Array.from(newThisWeek),
        teamMembers: teamMembers?.length || 0,
        productivityScore,
        timeChange: Math.round(timeChange * 100) / 100,
        heatmapData,
      },
    });
  } catch (error) {
    console.error('Error fetching time tracking analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
