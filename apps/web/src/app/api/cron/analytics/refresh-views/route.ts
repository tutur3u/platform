/**
 * Analytics Materialized Views Refresh Cron Job
 * GET /api/cron/analytics/refresh-views
 *
 * Refreshes all analytics materialized views for improved query performance.
 * Should be triggered by Vercel Cron every 5 minutes.
 *
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/analytics/refresh-views",
 *     "schedule": "* /5 * * * *"
 *   }]
 * }
 */

import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    console.error('CRON_SECRET or VERCEL_CRON_SECRET is not set');
    return NextResponse.json(
      {
        ok: false,
        error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set',
      },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('Invalid cron secret');
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  const startTime = Date.now();

  try {
    const supabase = createClient();

    // Call the RPC function to refresh materialized views
    const { error } = await supabase.rpc('refresh_analytics_materialized_views');

    if (error) {
      console.error('Error refreshing materialized views:', error);
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          duration: Date.now() - startTime,
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;

    console.log(
      `Analytics materialized views refreshed successfully in ${duration}ms`
    );

    return NextResponse.json({
      ok: true,
      message: 'Materialized views refreshed successfully',
      refreshed_at: new Date().toISOString(),
      duration,
      views: [
        'analytics_daily_summary',
        'analytics_geographic_summary',
      ],
    });
  } catch (error) {
    console.error('Error in refresh-views cron job:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'An unexpected error occurred',
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
