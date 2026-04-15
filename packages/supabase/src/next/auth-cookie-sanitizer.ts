type CookieLike = {
  name: string;
  value: string;
};

const SUPABASE_BASE64_PREFIX = 'base64-';
const BASE64_URL_BODY_PATTERN = /^[A-Za-z0-9_-]*$/;
const EXPIRED_COOKIE_OPTIONS = {
  expires: new Date(0),
  maxAge: 0,
  path: '/',
};

function getSupabaseAuthStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

function getChunkIndex(cookieName: string, storageKey: string): number | null {
  if (cookieName === storageKey) {
    return -1;
  }

  if (!cookieName.startsWith(`${storageKey}.`)) {
    return null;
  }

  const chunkSuffix = cookieName.slice(storageKey.length + 1);
  return /^\d+$/.test(chunkSuffix) ? Number(chunkSuffix) : null;
}

function combineAuthCookieChunks(
  authCookies: CookieLike[],
  storageKey: string
): string | null {
  const baseCookie = authCookies.find((cookie) => cookie.name === storageKey);
  if (baseCookie) {
    return baseCookie.value;
  }

  const chunkMap = new Map<number, string>();
  for (const cookie of authCookies) {
    const chunkIndex = getChunkIndex(cookie.name, storageKey);
    if (chunkIndex === null || chunkIndex < 0) {
      continue;
    }

    chunkMap.set(chunkIndex, cookie.value);
  }

  if (!chunkMap.has(0)) {
    return null;
  }

  const chunks: string[] = [];
  for (let i = 0; chunkMap.has(i); i += 1) {
    chunks.push(chunkMap.get(i)!);
  }

  return chunks.join('');
}

function isMalformedBase64CookieValue(cookieValue: string): boolean {
  if (!cookieValue.startsWith(SUPABASE_BASE64_PREFIX)) {
    return false;
  }

  return !BASE64_URL_BODY_PATTERN.test(
    cookieValue.slice(SUPABASE_BASE64_PREFIX.length)
  );
}

export function sanitizeSupabaseAuthCookies(
  cookies: CookieLike[],
  url: string,
  clearCookie?: (
    name: string,
    options?: { expires?: Date; maxAge?: number; path?: string }
  ) => void
): CookieLike[] {
  const storageKey = getSupabaseAuthStorageKey(url);
  const authCookies = cookies.filter(
    (cookie) => getChunkIndex(cookie.name, storageKey) !== null
  );

  if (authCookies.length === 0) {
    return cookies;
  }

  const combinedValue = combineAuthCookieChunks(authCookies, storageKey);
  if (!combinedValue || !isMalformedBase64CookieValue(combinedValue)) {
    return cookies;
  }

  for (const cookie of authCookies) {
    clearCookie?.(cookie.name, EXPIRED_COOKIE_OPTIONS);
  }

  return cookies.filter(
    (cookie) => getChunkIndex(cookie.name, storageKey) === null
  );
}

export function getMalformedSupabaseAuthCookieNames(
  cookies: CookieLike[],
  url: string | null | undefined
): string[] {
  if (!url) {
    return [];
  }

  const storageKey = getSupabaseAuthStorageKey(url);
  const authCookies = cookies.filter(
    (cookie) => getChunkIndex(cookie.name, storageKey) !== null
  );

  if (authCookies.length === 0) {
    return [];
  }

  const combinedValue = combineAuthCookieChunks(authCookies, storageKey);
  if (!combinedValue || !isMalformedBase64CookieValue(combinedValue)) {
    return [];
  }

  return authCookies.map((cookie) => cookie.name);
}
