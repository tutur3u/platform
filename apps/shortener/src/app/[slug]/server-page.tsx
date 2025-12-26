import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { isValidUrl } from '@/lib/utils';
import { trackLinkClick } from '@/lib/analytics';
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
  await trackLinkClick(shortenedLink.id, slug);

  redirect(shortenedLink.link);
}
