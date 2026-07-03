import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceApiKeyUsageLog } from '@tuturuuu/types';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

import { assertWorkspaceApiKeysAccess } from '../../shared';

const UsageLogsQuerySchema = z.object({
  page: z.string().max(MAX_LONG_TEXT_LENGTH).optional().default('1'),
  pageSize: z.string().max(MAX_LONG_TEXT_LENGTH).optional().default('10'),
  from: z.string().max(MAX_COLOR_LENGTH).optional(),
  to: z.string().max(MAX_COLOR_LENGTH).optional(),
  status: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  method: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  endpoint: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
});

interface RouteParams {
  wsId: string;
  keyId: string;
}

export const GET = withSessionAuth<RouteParams>(
  async (req: NextRequest, { user, supabase }, rawParams) => {
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const validation = UsageLogsQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: 'Invalid query parameters',
          errors: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { page, pageSize, from, to, status, method, endpoint } =
      validation.data;

    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);
      const { keyId } = rawParams;

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const sbAdmin = await createAdminClient();

      const { data: apiKey, error: keyError } = await sbAdmin
        .from('workspace_api_keys')
        .select('id, ws_id')
        .eq('id', keyId)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (keyError || !apiKey) {
        return NextResponse.json(
          { message: 'API key not found' },
          { status: 404 }
        );
      }

      let queryBuilder = sbAdmin
        .from('workspace_api_key_usage_logs')
        .select('*', { count: 'exact' })
        .eq('api_key_id', keyId)
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (from) {
        queryBuilder = queryBuilder.gte('created_at', from);
      }

      if (to) {
        queryBuilder = queryBuilder.lte('created_at', to);
      }

      if (status && status !== 'all') {
        if (status.endsWith('xx')) {
          const rangePrefix = Number.parseInt(status.charAt(0), 10);
          if (!Number.isNaN(rangePrefix)) {
            const rangeStart = rangePrefix * 100;
            const rangeEnd = rangeStart + 99;
            queryBuilder = queryBuilder
              .gte('status_code', rangeStart)
              .lte('status_code', rangeEnd);
          }
        } else {
          const statusCode = Number.parseInt(status, 10);
          if (!Number.isNaN(statusCode)) {
            queryBuilder = queryBuilder.eq('status_code', statusCode);
          }
        }
      }

      if (endpoint) {
        queryBuilder = queryBuilder.ilike('endpoint', `%${endpoint}%`);
      }

      if (method && method !== 'all') {
        queryBuilder = queryBuilder.eq('method', method);
      }

      const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
      const parsedSize = Math.max(1, Number.parseInt(pageSize, 10) || 10);
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

      let statsQuery = sbAdmin
        .from('workspace_api_key_usage_logs')
        .select('status_code, response_time_ms')
        .eq('api_key_id', keyId)
        .eq('ws_id', wsId);

      if (from) {
        statsQuery = statsQuery.gte('created_at', from);
      }
      if (to) {
        statsQuery = statsQuery.lte('created_at', to);
      }
      if (status && status !== 'all') {
        if (status.endsWith('xx')) {
          const rangePrefix = Number.parseInt(status.charAt(0), 10);
          if (!Number.isNaN(rangePrefix)) {
            const rangeStart = rangePrefix * 100;
            const rangeEnd = rangeStart + 99;
            statsQuery = statsQuery
              .gte('status_code', rangeStart)
              .lte('status_code', rangeEnd);
          }
        } else {
          const statusCode = Number.parseInt(status, 10);
          if (!Number.isNaN(statusCode)) {
            statsQuery = statsQuery.eq('status_code', statusCode);
          }
        }
      }
      if (endpoint) {
        statsQuery = statsQuery.ilike('endpoint', `%${endpoint}%`);
      }
      if (method && method !== 'all') {
        statsQuery = statsQuery.eq('method', method);
      }

      const { data: statsData } = await statsQuery;

      const stats = {
        totalRequests: count ?? 0,
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
);
