/**
 * Link Analytics Summary Endpoint
 * GET /api/v1/links/:id/analytics - Get comprehensive analytics for a link
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

    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = createClient();

    // Verify link exists and belongs to workspace
    const { data: link, error: linkError } = await supabase
      .from('shortened_links')
      .select('*')
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

    // Build analytics query
    let analyticsQuery = supabase
      .from('link_analytics')
      .select('*')
      .eq('link_id', id);

    if (startDate) {
      analyticsQuery = analyticsQuery.gte('clicked_at', startDate);
    }
    if (endDate) {
      analyticsQuery = analyticsQuery.lte('clicked_at', endDate);
    }

    const { data: clicks, error: analyticsError } = await analyticsQuery;

    if (analyticsError) {
      console.error('Error fetching analytics:', analyticsError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch analytics',
        },
        { status: 500 }
      );
    }

    // Calculate metrics
    const totalClicks = clicks?.length || 0;
    const uniqueVisitors = new Set(
      clicks?.map((c) => c.ip_address).filter(Boolean)
    ).size;
    const uniqueReferrers = new Set(
      clicks?.map((c) => c.referrer_domain).filter(Boolean)
    ).size;
    const uniqueCountries = new Set(
      clicks?.map((c) => c.country).filter(Boolean)
    ).size;

    // Get first and last click
    const sortedClicks = clicks?.sort(
      (a, b) =>
        new Date(a.clicked_at).getTime() - new Date(b.clicked_at).getTime()
    );
    const firstClick = sortedClicks?.[0]?.clicked_at || null;
    const lastClick = sortedClicks?.[sortedClicks.length - 1]?.clicked_at || null;

    // Get top referrer
    const referrerCounts = new Map<string, number>();
    clicks?.forEach((c) => {
      if (c.referrer_domain) {
        referrerCounts.set(
          c.referrer_domain,
          (referrerCounts.get(c.referrer_domain) || 0) + 1
        );
      }
    });
    const topReferrer = Array.from(referrerCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    // Get top country
    const countryCounts = new Map<string, number>();
    clicks?.forEach((c) => {
      if (c.country) {
        countryCounts.set(c.country, (countryCounts.get(c.country) || 0) + 1);
      }
    });
    const topCountry = Array.from(countryCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return NextResponse.json({
      data: {
        link: {
          id: link.id,
          url: link.link,
          slug: link.slug,
          domain: link.domain,
          createdAt: link.created_at,
        },
        summary: {
          totalClicks,
          uniqueVisitors,
          uniqueReferrers,
          uniqueCountries,
          firstClickAt: firstClick,
          lastClickAt: lastClick,
        },
        topReferrer: topReferrer
          ? {
              domain: topReferrer[0],
              clicks: topReferrer[1],
            }
          : null,
        topCountry: topCountry
          ? {
              country: topCountry[0],
              clicks: topCountry[1],
            }
          : null,
      },
    });
  },
  {
    permissions: ['manage_drive', 'view_analytics'],
    requireAll: false,
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
