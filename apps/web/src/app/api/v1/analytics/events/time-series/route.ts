/**
 * Events Time Series Endpoint
 * GET /api/v1/analytics/events/time-series
 *
 * Returns time series data for events (by hour, day, week, or month).
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
    const granularity = searchParams.get('granularity') || 'day'; // hour, day, week, month
    const eventName = searchParams.get('event_name');

    const supabase = createClient();

    // Determine the date truncation based on granularity
    let dateFormat: string;
    switch (granularity) {
      case 'hour':
        dateFormat = 'YYYY-MM-DD HH24:00:00';
        break;
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO week
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'day':
      default:
        dateFormat = 'YYYY-MM-DD';
        break;
    }

    // Build query with date truncation
    let query = supabase.rpc('get_events_time_series', {
      p_ws_id: wsId,
      p_start_date: startDate || undefined,
      p_end_date: endDate || undefined,
      p_event_name: eventName || undefined,
      p_date_format: dateFormat,
    });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching time series:', error);

      // Fallback to manual aggregation if RPC doesn't exist
      let fallbackQuery = supabase
        .from('analytics_events')
        .select('timestamp, session_id')
        .eq('ws_id', wsId);

      if (startDate) fallbackQuery = fallbackQuery.gte('timestamp', startDate);
      if (endDate) fallbackQuery = fallbackQuery.lte('timestamp', endDate);
      if (eventName) fallbackQuery = fallbackQuery.eq('event_name', eventName);

      const { data: events, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        console.error('Fallback query failed:', fallbackError);
        return NextResponse.json(
          {
            error: 'Internal Server Error',
            message: 'Failed to fetch time series data',
          },
          { status: 500 }
        );
      }

      // Group by date
      const grouped = new Map<
        string,
        { count: number; sessions: Set<string> }
      >();

      (events || []).forEach((event) => {
        const date = new Date(event.timestamp);
        let key: string;

        switch (granularity) {
          case 'hour':
            key = date.toISOString().substring(0, 13) + ':00:00';
            break;
          case 'week':
            const weekYear = date.getFullYear();
            const weekNum = Math.ceil(
              (date.getTime() - new Date(weekYear, 0, 1).getTime()) /
                (7 * 24 * 60 * 60 * 1000)
            );
            key = `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
            break;
          case 'month':
            key = date.toISOString().substring(0, 7);
            break;
          case 'day':
          default:
            key = date.toISOString().substring(0, 10);
            break;
        }

        if (!grouped.has(key)) {
          grouped.set(key, { count: 0, sessions: new Set() });
        }
        const stats = grouped.get(key)!;
        stats.count++;
        stats.sessions.add(event.session_id);
      });

      const transformedData = Array.from(grouped.entries())
        .map(([date, stats]) => ({
          date,
          count: stats.count,
          uniqueVisitors: stats.sessions.size,
          sessions: stats.sessions.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        data: transformedData,
      });
    }

    // Transform RPC result to camelCase
    const transformedData = (data || []).map((item: any) => ({
      date: item.date,
      count: Number(item.count) || 0,
      uniqueVisitors: Number(item.unique_visitors) || 0,
      sessions: Number(item.sessions) || 0,
    }));

    return NextResponse.json({
      data: transformedData,
    });
  },
  {
    permissions: ['view_analytics'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
