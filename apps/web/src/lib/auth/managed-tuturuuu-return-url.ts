import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';
import {
  getTuturuuuPrimarySharedCookieDomain,
  resolveTuturuuuSharedCookieDomain,
} from '@tuturuuu/utils/shared-cookie';

const VERIFY_TOKEN_ROUTE_SEGMENT = 'verify-token';

/**
 * Where the current web host comes from: a request (headers + url), a URL, or
 * `null` for the ambient browser location / configured app URL. Server code
 * should always pass the request; the `null` default is for browser code.
 */
export type ManagedCurrentHost = Parameters<
  typeof resolveTuturuuuSharedCookieDomain
>[0];

/**
 * A host is "managed" (no cross-app token needed, the session cookie is shared)
 * only when BOTH the return host and the current web host sit under the
 * configured primary shared cookie domain (`.tuturuuu.com` by default,
 * `NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN` elsewhere, for example
 * `.staging.tutur3u.com`). Any host outside it must go through the token
 * handoff, even if the other side is a managed host.
 */
export function isManagedTuturuuuHostname(
  hostname: string,
  currentHost: ManagedCurrentHost = null
) {
  const normalizedHostname = hostname.toLowerCase();
  const managedHostname = getTuturuuuPrimarySharedCookieDomain().hostname;

  return (
    (normalizedHostname === managedHostname ||
      normalizedHostname.endsWith(`.${managedHostname}`)) &&
    resolveTuturuuuSharedCookieDomain(currentHost)?.hostname === managedHostname
  );
}

export function isRootTuturuuuHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === getTuturuuuPrimarySharedCookieDomain().hostname ||
    getAppDomainByUrl(`https://${normalizedHostname}`)?.name === 'platform'
  );
}

function hasAsciiControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);

    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }

  return false;
}

function normalizeRedirectPath(
  value: string | null | undefined,
  fallbackPath: string
) {
  if (
    !value?.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    hasAsciiControlCharacter(value)
  ) {
    return fallbackPath;
  }

  return value;
}

export function parseManagedTuturuuuReturnUrl(
  value: string,
  currentHost: ManagedCurrentHost = null
) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  if (!isManagedTuturuuuHostname(url.hostname, currentHost)) {
    return null;
  }

  if (url.username || url.password || url.port) {
    return null;
  }

  url.protocol = 'https:';
  return url;
}

function getFlattenedVerifyTokenTargetPath(url: URL, fallbackPath: string) {
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments[pathSegments.length - 1] !== VERIFY_TOKEN_ROUTE_SEGMENT) {
    return null;
  }

  return normalizeRedirectPath(
    url.searchParams.get('nextUrl') ?? url.searchParams.get('next'),
    fallbackPath
  );
}

export function normalizeManagedTuturuuuReturnUrl(
  value: string,
  {
    currentHost = null,
    fallbackPath = '/',
  }: {
    currentHost?: ManagedCurrentHost;
    fallbackPath?: string;
  } = {}
) {
  const url = parseManagedTuturuuuReturnUrl(value, currentHost);

  if (!url) {
    return null;
  }

  const flattenedTargetPath = getFlattenedVerifyTokenTargetPath(
    url,
    fallbackPath
  );

  if (flattenedTargetPath) {
    return new URL(flattenedTargetPath, url.origin).toString();
  }

  return url.toString();
}
