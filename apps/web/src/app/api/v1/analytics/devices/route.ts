/**
 * Device Analytics Endpoint
 * GET /api/v1/analytics/devices
 *
 * Returns device, browser, and OS breakdown statistics.
 * Requires authentication and view_analytics permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withApiAuth(
  async (request: NextRequest, { context }) => {
    const { wsId } = context;
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = createClient();

    // Build query for sessions
    let query = supabase
      .from('analytics_sessions')
      .select('device_type, browser, os, id')
      .eq('ws_id', wsId);

    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching device data:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch device breakdown',
        },
        { status: 500 }
      );
    }

    // Count occurrences
    const deviceTypeCounts = new Map<string, number>();
    const browserCounts = new Map<string, number>();
    const osCounts = new Map<string, number>();
    let totalSessions = 0;

    (data || []).forEach((session) => {
      totalSessions++;

      if (session.device_type) {
        deviceTypeCounts.set(
          session.device_type,
          (deviceTypeCounts.get(session.device_type) || 0) + 1
        );
      }

      if (session.browser) {
        browserCounts.set(
          session.browser,
          (browserCounts.get(session.browser) || 0) + 1
        );
      }

      if (session.os) {
        osCounts.set(session.os, (osCounts.get(session.os) || 0) + 1);
      }
    });

    // Convert to arrays with percentages
    const deviceTypes = Array.from(deviceTypeCounts.entries())
      .map(([deviceType, count]) => ({
        deviceType,
        count,
        percentage:
          totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const browsers = Array.from(browserCounts.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage:
          totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const operatingSystems = Array.from(osCounts.entries())
      .map(([os, count]) => ({
        os,
        count,
        percentage:
          totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      data: {
        deviceTypes,
        browsers,
        operatingSystems,
      },
    });
  },
  {
    permissions: ['view_analytics'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
