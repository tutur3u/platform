import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getLocale } from 'next-intl/server';
import { NotFoundStatusPage } from './not-found-status-page';

async function hasSignedInUser() {
  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    return Boolean(user);
  } catch {
    // Offering sign-in when the session cannot be read is harmless.
    return false;
  }
}

/**
 * `notFound()` under a locale: the shared Tuturuuu status page (404). Signed-out
 * visitors also get a sign-in link back to this path, because an unknown-shaped
 * path such as a bare workspace handle may exist behind sign-in (USER M-6).
 */
export default async function NotFound() {
  const [locale, signedIn] = await Promise.all([
    getLocale(),
    hasSignedInUser(),
  ]);
  return <NotFoundStatusPage locale={locale} signedIn={signedIn} />;
}
