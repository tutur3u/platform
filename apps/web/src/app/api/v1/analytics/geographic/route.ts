/**
 * Geographic Analytics Endpoint
 * GET /api/v1/analytics/geographic
 *
 * Returns geographic data with lat/long coordinates for mapping and heatmaps.
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
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const supabase = createClient();

    // Query the geographic summary materialized view for better performance
    let query = supabase
      .from('analytics_geographic_summary')
      .select('*')
      .eq('ws_id', wsId)
      .order('session_count', { ascending: false })
      .limit(limit);

    const { data: summaryData, error: summaryError } = await query;

    if (summaryError) {
      console.error('Error fetching geographic summary:', summaryError);

      // Fallback to querying sessions directly
      let fallbackQuery = supabase
        .from('analytics_sessions')
        .select(
          'country, country_region, city, latitude, longitude, id, visitor_id'
        )
        .eq('ws_id', wsId)
        .not('country', 'is', null);

      if (startDate) {
        fallbackQuery = fallbackQuery.gte('started_at', startDate);
      }
      if (endDate) {
        fallbackQuery = fallbackQuery.lte('started_at', endDate);
      }

      const { data: sessions, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        console.error('Fallback query failed:', fallbackError);
        return NextResponse.json(
          {
            error: 'Internal Server Error',
            message: 'Failed to fetch geographic data',
          },
          { status: 500 }
        );
      }

      // Group by location
      const locationMap = new Map<
        string,
        {
          country?: string;
          countryRegion?: string;
          city?: string;
          latitude?: number;
          longitude?: number;
          sessionCount: number;
          visitors: Set<string>;
        }
      >();

      (sessions || []).forEach((session) => {
        const key = `${session.country}_${session.city}_${session.latitude}_${session.longitude}`;

        if (!locationMap.has(key)) {
          locationMap.set(key, {
            country: session.country || undefined,
            countryRegion: session.country_region || undefined,
            city: session.city || undefined,
            latitude: session.latitude || undefined,
            longitude: session.longitude || undefined,
            sessionCount: 0,
            visitors: new Set(),
          });
        }

        const location = locationMap.get(key)!;
        location.sessionCount++;
        location.visitors.add(session.visitor_id);
      });

      const transformedData = Array.from(locationMap.values())
        .map((location) => ({
          country: location.country,
          countryRegion: location.countryRegion,
          city: location.city,
          latitude: location.latitude,
          longitude: location.longitude,
          sessionCount: location.sessionCount,
          uniqueVisitors: location.visitors.size,
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .slice(0, limit);

      return NextResponse.json({
        data: transformedData,
      });
    }

    // Transform materialized view data to camelCase
    const transformedData = (summaryData || []).map((item) => ({
      country: item.country || undefined,
      countryRegion: item.country_region || undefined,
      city: item.city || undefined,
      latitude: item.latitude || undefined,
      longitude: item.longitude || undefined,
      sessionCount: Number(item.session_count) || 0,
      uniqueVisitors: Number(item.unique_visitors) || 0,
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
