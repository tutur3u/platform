/**
 * Analytics Events List Endpoint
 * GET /api/v1/analytics/events
 *
 * Returns paginated list of events with filtering options.
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
    const eventName = searchParams.get('event_name');
    const pagePath = searchParams.get('page_path');
    const referrerDomain = searchParams.get('referrer_domain');
    const country = searchParams.get('country');
    const deviceType = searchParams.get('device_type');
    const browser = searchParams.get('browser');
    const os = searchParams.get('os');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createClient();

    // Build query
    let query = supabase
      .from('analytics_events')
      .select(
        `
        id,
        event_name,
        event_properties,
        page_url,
        page_title,
        page_path,
        referrer,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        timestamp,
        created_at,
        session_id,
        analytics_sessions!inner(
          visitor_id,
          country,
          city,
          device_type,
          browser,
          os
        )
      `,
        { count: 'exact' }
      )
      .eq('ws_id', wsId)
      .order('timestamp', { ascending: false });

    // Apply filters
    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }
    if (eventName) {
      query = query.eq('event_name', eventName);
    }
    if (pagePath) {
      query = query.ilike('page_path', `%${pagePath}%`);
    }
    if (referrerDomain) {
      query = query.eq('referrer_domain', referrerDomain);
    }
    if (country) {
      query = query.eq('analytics_sessions.country', country);
    }
    if (deviceType) {
      query = query.eq('analytics_sessions.device_type', deviceType);
    }
    if (browser) {
      query = query.eq('analytics_sessions.browser', browser);
    }
    if (os) {
      query = query.eq('analytics_sessions.os', os);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch events',
        },
        { status: 500 }
      );
    }

    // Transform to camelCase
    const transformedData = (data || []).map((event) => ({
      id: event.id,
      eventName: event.event_name,
      eventProperties: event.event_properties,
      pageUrl: event.page_url,
      pageTitle: event.page_title,
      pagePath: event.page_path,
      referrer: event.referrer,
      referrerDomain: event.referrer_domain,
      utmSource: event.utm_source,
      utmMedium: event.utm_medium,
      utmCampaign: event.utm_campaign,
      utmTerm: event.utm_term,
      utmContent: event.utm_content,
      timestamp: event.timestamp,
      createdAt: event.created_at,
      sessionId: event.session_id,
      session: event.analytics_sessions
        ? {
            visitorId: event.analytics_sessions.visitor_id,
            country: event.analytics_sessions.country,
            city: event.analytics_sessions.city,
            deviceType: event.analytics_sessions.device_type,
            browser: event.analytics_sessions.browser,
            os: event.analytics_sessions.os,
          }
        : undefined,
    }));

    return NextResponse.json({
      data: transformedData,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  },
  {
    permissions: ['view_analytics'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
