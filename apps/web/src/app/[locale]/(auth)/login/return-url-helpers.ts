import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { getMountedAppVerifyTokenMatch } from '@tuturuuu/utils/internal-app-mounts';
import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';
import {
  isManagedTuturuuuHostname,
  isRootTuturuuuHostname,
  normalizeManagedTuturuuuReturnUrl,
} from '@/lib/auth/managed-tuturuuu-return-url';

const INVALID_LOCAL_RETURN_URL = '__invalid_local_return_url__';
export const MANAGED_TUTURUUU_RETURN_APP = 'managed-tuturuuu';
const VERIFY_TOKEN_FALLBACK_PATH = '/onboarding';
const VERIFY_TOKEN_ROUTE_SEGMENT = 'verify-token';

export function getSafeLocalReturnPath(returnUrl: string | null | undefined) {
  const normalizedReturnUrl = normalizeClientRedirectPath(
    returnUrl,
    INVALID_LOCAL_RETURN_URL
  );

  return normalizedReturnUrl === INVALID_LOCAL_RETURN_URL
    ? null
    : normalizedReturnUrl;
}

export function getPlatformVerifyTokenNextPath(redirectUrl: URL) {
  const pathSegments = redirectUrl.pathname.split('/').filter(Boolean);

  if (pathSegments[pathSegments.length - 1] !== VERIFY_TOKEN_ROUTE_SEGMENT) {
    return null;
  }

  return normalizeClientRedirectPath(
    redirectUrl.searchParams.get('nextUrl'),
    VERIFY_TOKEN_FALLBACK_PATH
  );
}

function isLoginPath(pathname: string) {
  const pathSegments = pathname.split('/').filter(Boolean);

  return pathSegments[pathSegments.length - 1] === 'login';
}

export function buildManagedTuturuuuCurrentReturnUrl() {
  try {
    const currentUrl = new URL(window.location.href);

    if (
      !isManagedTuturuuuHostname(currentUrl.hostname) ||
      isRootTuturuuuHostname(currentUrl.hostname)
    ) {
      return null;
    }

    const rawNextPath =
      currentUrl.searchParams.get('nextUrl') ??
      currentUrl.searchParams.get('next') ??
      (isLoginPath(currentUrl.pathname)
        ? '/'
        : `${currentUrl.pathname}${currentUrl.search}`);
    const nextPath = normalizeClientRedirectPath(rawNextPath, '/');

    return normalizeManagedTuturuuuReturnUrl(
      new URL(nextPath, currentUrl.origin).toString()
    );
  } catch {
    return null;
  }
}

export function getStaticReturnApp(
  returnUrl: string | null | undefined,
  localReturnPath: string | null
) {
  if (!returnUrl) return null;
  if (localReturnPath) return 'web';

  const appDomain =
    getMountedAppVerifyTokenMatch(returnUrl) ?? getAppDomainByUrl(returnUrl);
  if (appDomain?.kind === 'internal') return appDomain.name;

  return normalizeManagedTuturuuuReturnUrl(returnUrl)
    ? MANAGED_TUTURUUU_RETURN_APP
    : null;
}
