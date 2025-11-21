/**
 * Link Device Breakdown Endpoint
 * GET /api/v1/links/:id/analytics/devices - Get device, browser, and OS breakdown
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

    // Get all clicks with user agent data
    const { data: clicks, error: analyticsError } = await supabase
      .from('link_analytics')
      .select('user_agent, ip_address')
      .eq('link_id', id);

    if (analyticsError) {
      console.error('Error fetching devices:', analyticsError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch device data',
        },
        { status: 500 }
      );
    }

    // Parse user agents and categorize
    const deviceStats = new Map<string, { clicks: number; visitors: Set<string> }>();
    const browserStats = new Map<string, { clicks: number; visitors: Set<string> }>();
    const osStats = new Map<string, { clicks: number; visitors: Set<string> }>();

    clicks?.forEach((click) => {
      const ua = click.user_agent || 'Unknown';
      const device = parseDevice(ua);
      const browser = parseBrowser(ua);
      const os = parseOS(ua);

      // Track device type
      if (!deviceStats.has(device)) {
        deviceStats.set(device, { clicks: 0, visitors: new Set() });
      }
      const deviceData = deviceStats.get(device)!;
      deviceData.clicks++;
      if (click.ip_address) deviceData.visitors.add(click.ip_address);

      // Track browser
      if (!browserStats.has(browser)) {
        browserStats.set(browser, { clicks: 0, visitors: new Set() });
      }
      const browserData = browserStats.get(browser)!;
      browserData.clicks++;
      if (click.ip_address) browserData.visitors.add(click.ip_address);

      // Track OS
      if (!osStats.has(os)) {
        osStats.set(os, { clicks: 0, visitors: new Set() });
      }
      const osData = osStats.get(os)!;
      osData.clicks++;
      if (click.ip_address) osData.visitors.add(click.ip_address);
    });

    // Convert to arrays and sort
    const devices = Array.from(deviceStats.entries())
      .map(([device, stats]) => ({
        device,
        clicks: stats.clicks,
        uniqueVisitors: stats.visitors.size,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const browsers = Array.from(browserStats.entries())
      .map(([browser, stats]) => ({
        browser,
        clicks: stats.clicks,
        uniqueVisitors: stats.visitors.size,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const operatingSystems = Array.from(osStats.entries())
      .map(([os, stats]) => ({
        os,
        clicks: stats.clicks,
        uniqueVisitors: stats.visitors.size,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    return NextResponse.json({
      data: {
        devices,
        browsers,
        operatingSystems,
      },
    });
  },
  {
    permissions: ['manage_drive', 'view_analytics'],
    requireAll: false,
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);

// Helper function to parse device type from user agent
function parseDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'Tablet';
  } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return 'Bot';
  }
  return 'Desktop';
}

// Helper function to parse browser from user agent
function parseBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('opera/') || ua.includes('opr/')) return 'Opera';
  if (ua.includes('msie') || ua.includes('trident/')) return 'Internet Explorer';
  return 'Other';
}

// Helper function to parse OS from user agent
function parseOS(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';
  return 'Other';
}
