/**
 * Link Clicks By Day Endpoint
 * GET /api/v1/links/:id/analytics/clicks-by-day - Get daily click time series
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

    const days = Math.min(
      parseInt(searchParams.get('days') || '30'),
      365
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

    // Calculate start date
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get clicks grouped by day
    const { data: clicks, error: analyticsError } = await supabase
      .from('link_analytics')
      .select('clicked_at, ip_address')
      .eq('link_id', id)
      .gte('clicked_at', startDate.toISOString())
      .lte('clicked_at', endDate.toISOString())
      .order('clicked_at', { ascending: true });

    if (analyticsError) {
      console.error('Error fetching clicks:', analyticsError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch clicks',
        },
        { status: 500 }
      );
    }

    // Group by day
    const clicksByDay = new Map<string, { clicks: number; visitors: Set<string> }>();

    clicks?.forEach((click) => {
      const date = new Date(click.clicked_at).toISOString().split('T')[0];
      if (!clicksByDay.has(date)) {
        clicksByDay.set(date, { clicks: 0, visitors: new Set() });
      }
      const dayData = clicksByDay.get(date)!;
      dayData.clicks++;
      if (click.ip_address) {
        dayData.visitors.add(click.ip_address);
      }
    });

    // Fill in missing days with zeros
    const result = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = clicksByDay.get(dateStr);

      result.push({
        date: dateStr,
        clicks: dayData?.clicks || 0,
        uniqueVisitors: dayData?.visitors.size || 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

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
