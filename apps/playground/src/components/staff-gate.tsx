import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createPlaygroundLoginUrl } from '@/lib/login-url';
import { getPlaygroundAccess } from '@/lib/staff-access';

/**
 * Server-side backstop for the proxy redirect: pages render for verified root
 * staff only. Signed-out visitors go to sign-in, other accounts to the web app.
 */
export async function StaffGate({ children }: { children: React.ReactNode }) {
  const access = await getPlaygroundAccess();
  if (access.ok) return children;

  if (access.status === 403) redirect(resolveTuturuuuWebAppUrl());

  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https';
  redirect(
    createPlaygroundLoginUrl(host ? `${proto}://${host}/` : '/').toString()
  );
}
