/**
 * Link Top Countries Endpoint
 * GET /api/v1/links/:id/analytics/top-countries - Get top countries by clicks
 *
 * Requires authentication and workspace membership.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      parseInt(searchParams.get('limit') || '10'),
      50
    );

    const supabase = createClient();

    // Verify link exists and belongs to workspace
    const { data: link, error: linkError } = await supabase
      .from('shortened_links')
      .select('id')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Link not found',
        },
        { status: 404 }
      );
    }

    // Get all clicks with country data
    const { data: clicks, error: analyticsError } = await supabase
      .from('link_analytics')
      .select('country, city, ip_address')
      .eq('link_id', id)
      .not('country', 'is', null);

    if (analyticsError) {
      console.error('Error fetching countries:', analyticsError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch countries',
        },
        { status: 500 }
      );
    }

    // Count clicks and unique visitors per country
    const countryStats = new Map<
      string,
      { clicks: number; visitors: Set<string>; cities: Set<string> }
    >();

    clicks?.forEach((click) => {
      if (!click.country) return;

      if (!countryStats.has(click.country)) {
        countryStats.set(click.country, {
          clicks: 0,
          visitors: new Set(),
          cities: new Set(),
        });
      }

      const stats = countryStats.get(click.country)!;
      stats.clicks++;
      if (click.ip_address) {
        stats.visitors.add(click.ip_address);
      }
      if (click.city) {
        stats.cities.add(click.city);
      }
    });

    // Convert to array and sort by clicks
    const result = Array.from(countryStats.entries())
      .map(([country, stats]) => ({
        country,
        clicks: stats.clicks,
        uniqueVisitors: stats.visitors.size,
        uniqueCities: stats.cities.size,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit);

    return NextResponse.json({
      data: result,
    });
  },
  {
    permissions: ['manage_drive', 'view_analytics'],
    requireAll: false,
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
