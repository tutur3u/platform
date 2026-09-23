import { updateSession } from '@tuturuuu/supabase/next/proxy';
import { type NextRequest, NextResponse } from 'next/server';
import { discardAppCookiesForVerifiedProvider } from './required-mfa-credentials';
import { isAccountAssuranceRecoveryPath } from './required-mfa-proxy';

/** Refresh browser provider cookies before checking assurance, and propagate
 * rotated cookies even when policy redirects/rejects the subsequent request.
 * Explicit credentials and refresh/handoff handlers retain their own lifecycle.
 */
export async function guardBrowserApiSession(
  request: NextRequest,
  guard: () => Promise<NextResponse | null>
) {
  const hasProviderCookie = request.cookies
    .getAll()
    .some(({ name }) => /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(name));
  const session =
    !request.headers.has('authorization') &&
    hasProviderCookie &&
    !isAccountAssuranceRecoveryPath(request.nextUrl.pathname)
      ? await updateSession(request)
      : null;
  if (session?.claims) discardAppCookiesForVerifiedProvider(request);
  const response =
    (await guard()) ??
    NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of session?.res.headers.getSetCookie() ?? [])
    response.headers.append('set-cookie', cookie);
  return response;
}
