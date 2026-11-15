import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';

const MAX_RETURN_PATH_LENGTH = 2048;

/**
 * Sign-in link for the not-found page shown to a signed-out visitor: a bare
 * `/<handle>` may be a real workspace behind sign-in (USER M-6). The return
 * path must be a local, single-slash path without backslashes or control
 * characters (the login form's own rule); anything else signs in without one.
 */
export function buildNotFoundSignInHref(pathname: string | null | undefined) {
  const returnPath = normalizeClientRedirectPath(pathname, '');
  if (!returnPath || returnPath === '/') return '/login';
  if (returnPath.length > MAX_RETURN_PATH_LENGTH) return '/login';
  return `/login?returnUrl=${encodeURIComponent(returnPath)}`;
}
