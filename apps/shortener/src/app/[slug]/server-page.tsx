import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidUrl } from '@/lib/utils';
import PasswordForm from './password-form';

export default async function ServerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sbAdmin = await createAdminClient();

  const { data: shortenedLink, error } = await sbAdmin
    .from('shortened_links')
    .select('id, link, password_hash, password_hint')
    .eq('slug', slug)
    .single();

  if (error || !shortenedLink) {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-red-100 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <h1 className="mb-4 font-bold text-2xl text-red-900">
              Link Not Found
            </h1>
            <p className="mb-6 text-red-600">
              The shortened link you're looking for doesn't exist or has been
              removed.
            </p>
            <a
              href="/"
              className="inline-block rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Go to Homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!isValidUrl(shortenedLink.link)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-red-100 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <h1 className="mb-4 font-bold text-2xl text-red-900">
              Invalid URL
            </h1>
            <p className="mb-6 text-red-600">
              The shortened link you're looking for is invalid.
            </p>
            <a
              href="/"
              className="inline-block rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Go to Homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If password protected, show password form instead of redirecting
  if (shortenedLink.password_hash) {
    return (
      <PasswordForm
        linkId={shortenedLink.id}
        slug={slug}
        hint={shortenedLink.password_hint}
      />
    );
  }

  // Track click analytics (only for non-password-protected links)
  try {
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
      link_id: shortenedLink.id,
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
      console.log('Analytics tracked:', {
        slug,
        country,
        city,
        vercelRegion,
        deviceInfo: `${userAgent.substring(0, 100)}...`,
      });
    }
  } catch (analyticsError) {
    // Log analytics error but don't prevent redirect
    console.error('Failed to track click analytics:', analyticsError);

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

  redirect(shortenedLink.link);
}

