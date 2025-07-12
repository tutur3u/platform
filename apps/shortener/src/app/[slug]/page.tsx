import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidUrl } from '@/lib/utils';

interface RedirectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RedirectPage({ params }: RedirectPageProps) {
  const { slug } = await params;

  const sbAdmin = await createAdminClient();

  const { data: shortenedLink, error } = await sbAdmin
    .from('shortened_links')
    .select('id, link')
    .eq('slug', slug)
    .single();

  if (error || !shortenedLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 px-4 py-12 sm:px-6 lg:px-8">
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
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 px-4 py-12 sm:px-6 lg:px-8">
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

  // Track click analytics
  try {
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const referrer =
      headersList.get('referer') || headersList.get('referrer') || '';
    const forwarded = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');

    // Get IP address from various headers
    const ipAddress = forwarded?.split(',')[0]?.trim() || realIp || '';

    // Track the click
    await sbAdmin.from('link_analytics').insert({
      link_id: shortenedLink.id,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      referrer: referrer || null,
    });
  } catch (analyticsError) {
    // Log analytics error but don't prevent redirect
    console.error('Failed to track click analytics:', analyticsError);
  }

  redirect(shortenedLink.link);
}
