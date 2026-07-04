const MANAGED_TUTURUUU_HOSTNAME = 'tuturuuu.com';
const VERIFY_TOKEN_ROUTE_SEGMENT = 'verify-token';

export function isManagedTuturuuuHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === MANAGED_TUTURUUU_HOSTNAME ||
    normalizedHostname.endsWith(`.${MANAGED_TUTURUUU_HOSTNAME}`)
  );
}

export function isRootTuturuuuHostname(hostname: string) {
  return hostname.toLowerCase() === MANAGED_TUTURUUU_HOSTNAME;
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

export function parseManagedTuturuuuReturnUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  if (!isManagedTuturuuuHostname(url.hostname)) {
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
    fallbackPath = '/',
  }: {
    fallbackPath?: string;
  } = {}
) {
  const url = parseManagedTuturuuuReturnUrl(value);

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
