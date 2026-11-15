'use client';

import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import { usePathname } from 'next/navigation';
import { buildNotFoundSignInHref } from '@/lib/not-found-sign-in';

/** The shared 404 status page, with a sign-in link for signed-out visitors. */
export function NotFoundStatusPage({
  locale,
  signedIn,
}: {
  locale: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  return (
    <StatusPage
      helpHref="/contact"
      locale={locale}
      signInHref={signedIn ? undefined : buildNotFoundSignInHref(pathname)}
      variant="not-found"
    />
  );
}
