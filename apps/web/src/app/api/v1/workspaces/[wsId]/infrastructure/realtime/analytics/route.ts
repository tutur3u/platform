import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const QueryParamsSchema = z.object({
  workspaceId: z.uuid().optional(),
  channelId: z.string().optional(),
  // Accept ISO 8601 UTC timestamps from client
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  metric: z.enum(['requests', 'users']).default('requests'),
  viewMode: z.enum(['daily', 'hourly']).default('hourly'),
});

export async function GET(req: NextRequest, { params }: Params) {
  // wsId is validated through RLS policies on the database level
  await params;

  try {
    // Parse and validate query parameters
    const searchParams = req.nextUrl.searchParams;
    const validationResult = QueryParamsSchema.safeParse({
      workspaceId: searchParams.get('workspaceId') || undefined,
      channelId: searchParams.get('channelId') || undefined,
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      metric: searchParams.get('metric') || 'requests',
      viewMode: searchParams.get('viewMode') || 'hourly',
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

    const { workspaceId, channelId, startDate, endDate, metric } =
      validationResult.data;

    // Client sends UTC timestamps - use directly
    const utcStartDate = new Date(startDate);
    const utcEndDate = new Date(endDate);

    const supabase = await createClient();

    // Build the base query using UTC date range
    let query = supabase
      .from('realtime_log_aggregations')
      .select('time_bucket, total_count, user_id')
      .gte('time_bucket', utcStartDate.toISOString())
      .lte('time_bucket', utcEndDate.toISOString())
      .order('time_bucket', { ascending: true });

    // Apply optional filters
    if (workspaceId) {
      query = query.eq('ws_id', workspaceId);
    }

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    const { data: rawData, error } = await query;

    if (error) {
      console.error('Error fetching realtime analytics:', error);
      return NextResponse.json(
        { message: 'Error fetching realtime analytics' },
        { status: 500 }
      );
    }

    // Return raw UTC data - client will aggregate
    // Transform to include both metrics in the response
    const transformedData = rawData.map((row) => ({
      time_bucket: row.time_bucket, // UTC timestamp
      total_count: row.total_count || 0,
      user_id: row.user_id,
    }));

    return NextResponse.json({
      data: transformedData,
      metric,
    });
  } catch (error) {
    console.error('Unexpected error in realtime analytics API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
