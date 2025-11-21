/**
 * Analytics Summary Endpoint
 * GET /api/v1/analytics/summary
 *
 * Returns aggregated analytics metrics for a workspace.
 * Requires authentication and view_analytics permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withApiAuth(
  async (request: NextRequest, { context }) => {
    const { wsId } = context;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = createClient();

    // Call RPC function to get analytics summary
    const { data, error } = await supabase.rpc('get_analytics_summary', {
      p_ws_id: wsId,
      p_start_date: startDate || undefined,
      p_end_date: endDate || undefined,
    });

    if (error) {
      console.error('Error fetching analytics summary:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch analytics summary',
        },
        { status: 500 }
      );
    }

    // Transform snake_case to camelCase
    const summary = data?.[0] || {};
    const transformedData = {
      totalEvents: Number(summary.total_events) || 0,
      totalSessions: Number(summary.total_sessions) || 0,
      uniqueVisitors: Number(summary.unique_visitors) || 0,
      totalConversions: Number(summary.total_conversions) || 0,
      conversionRate: Number(summary.conversion_rate) || 0,
      avgSessionDuration: Number(summary.avg_session_duration) || 0,
      topEvent: {
        eventName: summary.top_event_name || undefined,
        count: Number(summary.top_event_count) || 0,
      },
      topCountry: {
        country: summary.top_country || undefined,
        count: Number(summary.top_country_count) || 0,
      },
      topDevice: {
        deviceType: summary.top_device_type || undefined,
        count: Number(summary.top_device_count) || 0,
      },
    };

    return NextResponse.json({
      data: transformedData,
    });
  },
  {
    permissions: ['view_analytics'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
