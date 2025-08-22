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

    // Determine date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
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

    // Get all workspace members
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select(
        `
        user_id,
        role,
        users!inner (
          id,
          display_name,
          avatar_url,
          user_private_details(email)
        )
      `
      )
      .eq('ws_id', wsId);

    if (membersError) throw membersError;

    // Get time tracking data for all members in the period
    const memberIds = members?.map((m) => m.user_id) || [];
    const teamTimeData: Record<string, any> = {};

    if (memberIds.length > 0) {
      const { data: sessions, error: sessionsError } = await supabase
        .from('time_tracking_sessions')
        .select(
          `
          user_id,
          duration_seconds,
          start_time,
          category_id,
          time_tracking_categories(name, color)
        `
        )
        .eq('ws_id', wsId)
        .in('user_id', memberIds)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', now.toISOString())
        .not('duration_seconds', 'is', null);

      if (sessionsError) throw sessionsError;

      // Aggregate time data by user
      sessions?.forEach((session) => {
        if (session.user_id && session.duration_seconds) {
          if (!teamTimeData[session.user_id]) {
            teamTimeData[session.user_id] = {
              total_time_seconds: 0,
              session_count: 0,
              categories: {},
              daily_activity: {},
            };
          }
          teamTimeData[session.user_id].total_time_seconds +=
            session.duration_seconds;
          teamTimeData[session.user_id].session_count += 1;

          // Track category breakdown
          const categoryName =
            session.time_tracking_categories?.name || 'Uncategorized';
          if (!teamTimeData[session.user_id].categories[categoryName]) {
            teamTimeData[session.user_id].categories[categoryName] = 0;
          }
          teamTimeData[session.user_id].categories[categoryName] +=
            session.duration_seconds;

          // Track daily activity
          const dateStr = new Date(session.start_time).toDateString();
          if (!teamTimeData[session.user_id].daily_activity[dateStr]) {
            teamTimeData[session.user_id].daily_activity[dateStr] = 0;
          }
          teamTimeData[session.user_id].daily_activity[dateStr] +=
            session.duration_seconds;
        }
      });
    }

    // Combine member data with time tracking stats
    const teamWithStats = members?.map((member) => {
      const timeData = teamTimeData[member.user_id] || {
        total_time_seconds: 0,
        session_count: 0,
        categories: {},
        daily_activity: {},
      };

      // Calculate productivity metrics
      const totalHours =
        Math.round((timeData.total_time_seconds / 3600) * 100) / 100;
      const avgHoursPerDay =
        timeData.session_count > 0
          ? Math.round(
              (totalHours /
                Math.ceil(
                  (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                )) *
                100
            ) / 100
          : 0;

      // Calculate consistency score
      const activeDays = Object.keys(timeData.daily_activity).length;
      const totalDays = Math.ceil(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const consistencyScore =
        totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

      // Get top category
      const topCategory = Object.entries(timeData.categories).reduce(
        (a, b) =>
          (timeData.categories[a[0]] || 0) > (timeData.categories[b[0]] || 0)
            ? a
            : b,
        ['', 0]
      )[0];

      return {
        id: member.user_id,
        name: member.users.display_name,
        avatar: member.users.avatar_url,
        email: member.users.user_private_details?.email,
        role: member.role,
        time_stats: {
          total_time_seconds: timeData.total_time_seconds,
          total_time_formatted: formatTime(timeData.total_time_seconds),
          total_hours: totalHours,
          session_count: timeData.session_count,
          avg_hours_per_day: avgHoursPerDay,
          consistency_score: consistencyScore,
          top_category: topCategory,
          category_breakdown: timeData.categories,
          daily_activity: Object.entries(timeData.daily_activity).map(
            ([date, seconds]) => ({
              date,
              time: Math.round((seconds as number) / 60), // Convert to minutes
            })
          ),
        },
      };
    });

    // Sort by total time (most productive first)
    teamWithStats?.sort(
      (a, b) =>
        (b.time_stats.total_time_seconds || 0) -
        (a.time_stats.total_time_seconds || 0)
    );

    // Calculate team totals
    const teamTotals = {
      total_members: teamWithStats?.length || 0,
      total_time_seconds:
        teamWithStats?.reduce(
          (sum, m) => sum + (m.time_stats.total_time_seconds || 0),
          0
        ) || 0,
      total_time_formatted: formatTime(
        teamWithStats?.reduce(
          (sum, m) => sum + (m.time_stats.total_time_seconds || 0),
          0
        ) || 0
      ),
      total_sessions:
        teamWithStats?.reduce(
          (sum, m) => sum + (m.time_stats.session_count || 0),
          0
        ) || 0,
      avg_consistency:
        teamWithStats?.length > 0
          ? Math.round(
              teamWithStats.reduce(
                (sum, m) => sum + (m.time_stats.consistency_score || 0),
                0
              ) / teamWithStats.length
            )
          : 0,
    };

    return NextResponse.json({
      team: teamWithStats || [],
      totals: teamTotals,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        type: period,
      },
    });
  } catch (error) {
    console.error('Error fetching time tracking team data:', error);
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
