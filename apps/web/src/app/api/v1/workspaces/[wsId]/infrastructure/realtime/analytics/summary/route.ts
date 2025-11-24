import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const QueryParamsSchema = z.object({
  workspaceId: z.uuid().optional(),
  channelId: z.string().optional(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
});

interface SummaryStats {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  uniqueUsers: number;
  uniqueChannels: number;
  uniqueWorkspaces: number;
  peakHour: string | null;
  peakHourCount: number;
  avgRequestsPerHour: number;
  requestsByKind: Record<string, number>;
}

interface TopConsumer {
  id: string;
  name: string;
  requests: number;
  errors: number;
  errorRate: number;
}

export async function GET(req: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = req.nextUrl.searchParams;
    const validationResult = QueryParamsSchema.safeParse({
      workspaceId: searchParams.get('workspaceId') || undefined,
      channelId: searchParams.get('channelId') || undefined,
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: 'Invalid query parameters',
          errors: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { workspaceId, channelId, startDate, endDate } =
      validationResult.data;

    const supabase = await createClient();

    // Build base query for aggregated data
    let query = supabase
      .from('realtime_log_aggregations')
      .select(
        'ws_id, user_id, channel_id, time_bucket, kind, total_count, error_count'
      )
      .gte('time_bucket', startDate)
      .lte('time_bucket', endDate);

    // Apply optional filters
    if (workspaceId) {
      query = query.eq('ws_id', workspaceId);
    }

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    const { data: rawData, error } = await query;

    if (error) {
      console.error('Error fetching realtime analytics summary:', error);
      return NextResponse.json(
        { message: 'Error fetching realtime analytics summary' },
        { status: 500 }
      );
    }

    if (!rawData || rawData.length === 0) {
      return NextResponse.json({
        summary: {
          totalRequests: 0,
          totalErrors: 0,
          errorRate: 0,
          uniqueUsers: 0,
          uniqueChannels: 0,
          uniqueWorkspaces: 0,
          peakHour: null,
          peakHourCount: 0,
          avgRequestsPerHour: 0,
          requestsByKind: {},
        },
        topWorkspaces: [],
        topChannels: [],
        topUsers: [],
        errorBreakdown: [],
      });
    }

    // Calculate summary statistics
    const uniqueUsers = new Set(
      rawData.filter((r) => r.user_id).map((r) => r.user_id)
    );
    const uniqueChannels = new Set(
      rawData.filter((r) => r.channel_id).map((r) => r.channel_id)
    );
    const uniqueWorkspaces = new Set(rawData.map((r) => r.ws_id));

    const totalRequests = rawData.reduce((sum, r) => sum + r.total_count, 0);
    const totalErrors = rawData.reduce((sum, r) => sum + r.error_count, 0);
    const errorRate =
      totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Calculate requests by kind
    const requestsByKind: Record<string, number> = {};
    for (const row of rawData) {
      requestsByKind[row.kind] =
        (requestsByKind[row.kind] || 0) + row.total_count;
    }

    // Calculate peak hour
    const hourlyData: Record<string, number> = {};
    for (const row of rawData) {
      const hour = new Date(row.time_bucket).getHours();
      const hourKey = `${hour.toString().padStart(2, '0')}:00`;
      hourlyData[hourKey] = (hourlyData[hourKey] || 0) + row.total_count;
    }

    let peakHour: string | null = null;
    let peakHourCount = 0;
    for (const [hour, count] of Object.entries(hourlyData)) {
      if (count > peakHourCount) {
        peakHour = hour;
        peakHourCount = count;
      }
    }

    // Calculate average requests per hour
    const hoursDiff = Math.max(
      1,
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60)
    );
    const avgRequestsPerHour = totalRequests / hoursDiff;

    const summary: SummaryStats = {
      totalRequests,
      totalErrors,
      errorRate: Math.round(errorRate * 100) / 100,
      uniqueUsers: uniqueUsers.size,
      uniqueChannels: uniqueChannels.size,
      uniqueWorkspaces: uniqueWorkspaces.size,
      peakHour,
      peakHourCount,
      avgRequestsPerHour: Math.round(avgRequestsPerHour * 100) / 100,
      requestsByKind,
    };

    // Calculate top consumers
    const workspaceMap = new Map<
      string,
      { requests: number; errors: number }
    >();
    const channelMap = new Map<string, { requests: number; errors: number }>();
    const userMap = new Map<string, { requests: number; errors: number }>();

    for (const row of rawData) {
      // Workspaces
      const wsData = workspaceMap.get(row.ws_id) || { requests: 0, errors: 0 };
      wsData.requests += row.total_count;
      wsData.errors += row.error_count;
      workspaceMap.set(row.ws_id, wsData);

      // Channels
      if (row.channel_id) {
        const chData = channelMap.get(row.channel_id) || {
          requests: 0,
          errors: 0,
        };
        chData.requests += row.total_count;
        chData.errors += row.error_count;
        channelMap.set(row.channel_id, chData);
      }

      // Users
      if (row.user_id) {
        const userData = userMap.get(row.user_id) || {
          requests: 0,
          errors: 0,
        };
        userData.requests += row.total_count;
        userData.errors += row.error_count;
        userMap.set(row.user_id, userData);
      }
    }

    // Fetch workspace names
    const workspaceIds = Array.from(workspaceMap.keys());
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name')
      .in('id', workspaceIds);

    const workspaceNameMap = new Map(
      (workspaces || []).map((ws) => [ws.id, ws.name])
    );

    // Fetch user names from users table (display_name) and user_private_details (email if needed)
    const userIds = Array.from(userMap.keys());
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', userIds);

    const userNameMap = new Map(
      (users || []).map((u) => [u.id, u.display_name || 'Unknown User'])
    );

    // Build top consumers arrays
    const topWorkspaces: TopConsumer[] = Array.from(workspaceMap.entries())
      .map(([id, data]) => ({
        id,
        name: workspaceNameMap.get(id) || 'Unknown Workspace',
        requests: data.requests,
        errors: data.errors,
        errorRate:
          data.requests > 0
            ? Math.round((data.errors / data.requests) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const topChannels: TopConsumer[] = Array.from(channelMap.entries())
      .map(([id, data]) => ({
        id,
        name: id,
        requests: data.requests,
        errors: data.errors,
        errorRate:
          data.requests > 0
            ? Math.round((data.errors / data.requests) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const topUsers: TopConsumer[] = Array.from(userMap.entries())
      .map(([id, data]) => ({
        id,
        name: userNameMap.get(id) || 'Unknown User',
        requests: data.requests,
        errors: data.errors,
        errorRate:
          data.requests > 0
            ? Math.round((data.errors / data.requests) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // Calculate error breakdown by kind
    const errorByKind: Record<string, { errors: number; total: number }> = {};
    for (const row of rawData) {
      if (!errorByKind[row.kind]) {
        errorByKind[row.kind] = { errors: 0, total: 0 };
      }
      errorByKind[row.kind]!.errors += row.error_count;
      errorByKind[row.kind]!.total += row.total_count;
    }

    const errorBreakdown = Object.entries(errorByKind)
      .map(([kind, data]) => ({
        kind,
        errors: data.errors,
        total: data.total,
        errorRate:
          data.total > 0
            ? Math.round((data.errors / data.total) * 10000) / 100
            : 0,
      }))
      .filter((item) => item.errors > 0)
      .sort((a, b) => b.errors - a.errors);

    return NextResponse.json({
      summary,
      topWorkspaces,
      topChannels,
      topUsers,
      errorBreakdown,
    });
  } catch (error) {
    console.error('Unexpected error in realtime analytics summary API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
