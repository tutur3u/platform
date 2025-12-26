import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';

export async function trackLinkClick(linkId: string, slug: string) {
  try {
    const sbAdmin = await createAdminClient();
    const headersList = await headers();

    // Standard headers
    const userAgent = headersList.get('user-agent') || '';
    const referrer =
      headersList.get('referer') || headersList.get('referrer') || '';
    const forwarded = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');

    // Get IP address from various headers
    const ipAddress = forwarded?.split(',')[0]?.trim() || realIp || '';

    // Vercel geolocation headers
    const country = headersList.get('x-vercel-ip-country') || '';
    const countryRegion = headersList.get('x-vercel-ip-country-region') || '';
    const city = headersList.get('x-vercel-ip-city') || '';
    const latitude = headersList.get('x-vercel-ip-latitude');
    const longitude = headersList.get('x-vercel-ip-longitude');
    const timezone = headersList.get('x-vercel-ip-timezone') || '';
    const postalCode = headersList.get('x-vercel-ip-postal-code') || '';

    // Vercel deployment headers
    const vercelId = headersList.get('x-vercel-id') || '';

    // Extract Vercel region from x-vercel-id header
    // The x-vercel-id header format is typically like "iad1::region::hash"
    const vercelRegion = vercelId.split('::')[0] || '';

    // Parse latitude and longitude as numbers
    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;

    // Prepare analytics data
    const analyticsData = {
      link_id: linkId,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      referrer: referrer || null,
      country: country || null,
      country_region: countryRegion || null,
      city: city || null,
      latitude: lat,
      longitude: lng,
      timezone: timezone || null,
      postal_code: postalCode || null,
      vercel_region: vercelRegion || null,
      vercel_id: vercelId || null,
    };

    // Track the click
    await sbAdmin.from('link_analytics').insert(analyticsData);

    // Log successful tracking for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('Link analytics tracked:', {
        slug,
        country,
        city,
        vercelRegion,
        deviceInfo: `${userAgent.substring(0, 100)}...`,
      });
    }
  } catch (analyticsError) {
    // Log analytics error but don't prevent redirect/response
    console.error('Failed to track link click analytics:', analyticsError);

    // In development, log more details for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('Analytics error details:', {
        slug,
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : analyticsError,
      });
    }
  }
}
