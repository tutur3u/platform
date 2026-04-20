type CookieLike = {
  name: string;
  value: string;
};

const SUPABASE_BASE64_PREFIX = 'base64-';
const BASE64_URL_BODY_PATTERN = /^[A-Za-z0-9_-]*$/;
const LEGACY_JSON_PREFIX_PATTERN = /^[[{]/u;
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

function hasMalformedChunkLayout(
  authCookies: CookieLike[],
  storageKey: string
): boolean {
  const hasBaseCookie = authCookies.some(
    (cookie) => cookie.name === storageKey
  );
  const chunkIndices = authCookies
    .map((cookie) => getChunkIndex(cookie.name, storageKey))
    .filter((index): index is number => typeof index === 'number' && index >= 0)
    .sort((left, right) => left - right);

  if (hasBaseCookie && chunkIndices.length > 0) {
    return true;
  }

  if (chunkIndices.length === 0) {
    return false;
  }

  if (chunkIndices[0] !== 0) {
    return true;
  }

  for (let index = 1; index < chunkIndices.length; index += 1) {
    const currentIndex = chunkIndices[index];
    const previousIndex = chunkIndices[index - 1];

    if (
      currentIndex === undefined ||
      previousIndex === undefined ||
      currentIndex !== previousIndex + 1
    ) {
      return true;
    }
  }

  return false;
}

function decodeBase64UrlJson(cookieValue: string): unknown | null {
  const base64Body = cookieValue.slice(SUPABASE_BASE64_PREFIX.length);
  return !BASE64_URL_BODY_PATTERN.test(base64Body)
    ? null
    : JSON.parse(
        Buffer.from(
          `${base64Body.replace(/-/gu, '+').replace(/_/gu, '/')}${'='.repeat(
            (4 - (base64Body.length % 4 || 4)) % 4
          )}`,
          'base64'
        ).toString('utf8')
      );
}

function looksLikeSupabaseSessionPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return (
    'access_token' in value ||
    'refresh_token' in value ||
    'expires_at' in value ||
    'user' in value
  );
}

function isMalformedSupabaseCookieValue(cookieValue: string): boolean {
  if (!cookieValue) {
    return true;
  }

  if (cookieValue.startsWith(SUPABASE_BASE64_PREFIX)) {
    try {
      const decodedValue = decodeBase64UrlJson(cookieValue);
      return !looksLikeSupabaseSessionPayload(decodedValue);
    } catch {
      return true;
    }
  }

  if (!LEGACY_JSON_PREFIX_PATTERN.test(cookieValue)) {
    return true;
  }

  try {
    return !looksLikeSupabaseSessionPayload(JSON.parse(cookieValue));
  } catch {
    return true;
  }
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
  const malformedChunkLayout = hasMalformedChunkLayout(authCookies, storageKey);
  if (
    (!combinedValue && !malformedChunkLayout) ||
    (combinedValue &&
      !malformedChunkLayout &&
      !isMalformedSupabaseCookieValue(combinedValue))
  ) {
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
  const malformedChunkLayout = hasMalformedChunkLayout(authCookies, storageKey);
  if (
    (!combinedValue && !malformedChunkLayout) ||
    (combinedValue &&
      !malformedChunkLayout &&
      !isMalformedSupabaseCookieValue(combinedValue))
  ) {
    return [];
  }

  return authCookies.map((cookie) => cookie.name);
}
