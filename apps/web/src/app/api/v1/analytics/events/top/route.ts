/**
 * Top Events Endpoint
 * GET /api/v1/analytics/events/top
 *
 * Returns top events by count with percentages.
 * Requires authentication and view_analytics permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withApiAuth(
  async (request: NextRequest, { context }) => {
    const { wsId } = context;
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = createClient();

    // Build query for top events
    let query = supabase
      .from('analytics_events')
      .select('event_name, session_id')
      .eq('ws_id', wsId);

    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching top events:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch top events',
        },
        { status: 500 }
      );
    }

    // Calculate counts and unique sessions
    const eventStats = new Map<
      string,
      { count: number; sessions: Set<string> }
    >();
    let totalEvents = 0;

    (data || []).forEach((event) => {
      if (!eventStats.has(event.event_name)) {
        eventStats.set(event.event_name, {
          count: 0,
          sessions: new Set(),
        });
      }
      const stats = eventStats.get(event.event_name)!;
      stats.count++;
      stats.sessions.add(event.session_id);
      totalEvents++;
    });

    // Sort by count and take top N
    const topEvents = Array.from(eventStats.entries())
      .map(([eventName, stats]) => ({
        eventName,
        count: stats.count,
        uniqueSessions: stats.sessions.size,
        percentage: totalEvents > 0 ? (stats.count / totalEvents) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return NextResponse.json({
      data: topEvents,
    });
  },
  {
    permissions: ['view_analytics'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
