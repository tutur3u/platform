import { createClient } from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

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
        category:time_tracking_categories(name, color)
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
