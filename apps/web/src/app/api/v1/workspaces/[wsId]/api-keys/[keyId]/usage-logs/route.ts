import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceApiKeyUsageLog } from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const UsageLogsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('10'),
  from: z.string().optional(), // ISO date string
  to: z.string().optional(), // ISO date string
  status: z.string().optional(), // HTTP status code filter
  endpoint: z.string().optional(), // Endpoint filter
});

interface Params {
  params: Promise<{
    wsId: string;
    keyId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, keyId } = await params;

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate query parameters
  const url = new URL(req.url);
  const queryParams = Object.fromEntries(url.searchParams);
  const validation = UsageLogsQuerySchema.safeParse(queryParams);

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: validation.error.issues },
      { status: 400 }
    );
  }

  const { page, pageSize, from, to, status, endpoint } = validation.data;

  try {
    // Verify the API key exists and belongs to the workspace
    const { data: apiKey, error: keyError } = await supabase
      .from('workspace_api_keys')
      .select('id, ws_id')
      .eq('id', keyId)
      .eq('ws_id', wsId)
      .single();

    if (keyError || !apiKey) {
      return NextResponse.json(
        { message: 'API key not found' },
        { status: 404 }
      );
    }

    // Build the query for usage logs
    let queryBuilder = supabase
      .from('workspace_api_key_usage_logs')
      .select('*', { count: 'exact' })
      .eq('api_key_id', keyId)
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (from) {
      queryBuilder = queryBuilder.gte('created_at', from);
    }

    if (to) {
      queryBuilder = queryBuilder.lte('created_at', to);
    }

    if (status) {
      const statusCode = parseInt(status, 10);
      if (!Number.isNaN(statusCode)) {
        queryBuilder = queryBuilder.eq('status_code', statusCode);
      }
    }

    if (endpoint) {
      queryBuilder = queryBuilder.ilike('endpoint', `%${endpoint}%`);
    }

    // Apply pagination
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(start, end);

    const { data: logs, error: logsError, count } = await queryBuilder;

    if (logsError) {
      console.error('Error fetching usage logs:', logsError);
      return NextResponse.json(
        { message: 'Error fetching usage logs' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const statsBuilder = supabase
      .from('workspace_api_key_usage_logs')
      .select('status_code, response_time_ms')
      .eq('api_key_id', keyId)
      .eq('ws_id', wsId);

    // Apply same date filters for stats
    let statsQuery = statsBuilder;
    if (from) {
      statsQuery = statsQuery.gte('created_at', from);
    }
    if (to) {
      statsQuery = statsQuery.lte('created_at', to);
    }

    const { data: statsData } = await statsQuery;

    const stats = {
      totalRequests: count || 0,
      successRate: 0,
      avgResponseTime: 0,
    };

    if (statsData && statsData.length > 0) {
      const successCount = statsData.filter(
        (log) => log.status_code >= 200 && log.status_code < 300
      ).length;
      stats.successRate = (successCount / statsData.length) * 100;

      const validResponseTimes = statsData
        .filter((log) => log.response_time_ms !== null)
        .map((log) => log.response_time_ms as number);

      if (validResponseTimes.length > 0) {
        stats.avgResponseTime =
          validResponseTimes.reduce((sum, time) => sum + time, 0) /
          validResponseTimes.length;
      }
    }

    return NextResponse.json({
      data: logs as WorkspaceApiKeyUsageLog[],
      count,
      stats,
    });
  } catch (error) {
    console.error('Error in usage logs API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
