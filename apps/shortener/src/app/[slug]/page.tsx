import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
    .select('link')
    .eq('slug', slug)
    .single();

  if (error || !shortenedLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-900 mb-4">
              Link Not Found
            </h1>
            <p className="text-red-600 mb-6">
              The shortened link you're looking for doesn't exist or has been
              removed.
            </p>
            <a
              href="/"
              className="inline-block bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
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
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-900 mb-4">
              Invalid URL
            </h1>
            <p className="text-red-600 mb-6">
              The shortened link you're looking for is invalid.
            </p>
            <a
              href="/"
              className="inline-block bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Go to Homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  redirect(shortenedLink.link);
}
