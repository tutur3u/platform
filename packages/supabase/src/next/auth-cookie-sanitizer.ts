import { getSupabaseAuthStorageKey } from './common';

type CookieLike = {
  name: string;
  value: string;
};
type ClearCookie = (
  name: string,
  options?: { expires?: Date; maxAge?: number; path?: string }
) => void;
type MirrorCookie = (name: string, value: string) => void;
type ValidAuthCookieGroup = {
  normalizedCookies: CookieLike[];
  storageKey: string;
};

const SUPABASE_BASE64_PREFIX = 'base64-';
const BASE64_URL_BODY_PATTERN = /^[A-Za-z0-9_-]*$/;
const LEGACY_JSON_PREFIX_PATTERN = /^[[{]/u;
const EXPIRED_COOKIE_OPTIONS = {
  expires: new Date(0),
  maxAge: 0,
  path: '/',
};

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

function dedupeAuthCookiesByName(authCookies: CookieLike[]) {
  const cookiesByName = new Map<string, CookieLike>();
  const duplicateNames = new Set<string>();

  for (const cookie of authCookies) {
    if (cookiesByName.has(cookie.name)) {
      duplicateNames.add(cookie.name);
    }

    cookiesByName.set(cookie.name, cookie);
  }

  return {
    duplicateNames,
    normalizedCookies: [...cookiesByName.values()],
  };
}

function getCookieHeaderNames(cookieHeader: string | null | undefined) {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((cookiePair) => cookiePair.trim())
    .map((cookiePair) => {
      const separatorIndex = cookiePair.indexOf('=');

      return separatorIndex > 0
        ? cookiePair.slice(0, separatorIndex).trim()
        : null;
    })
    .filter(
      (name): name is string => typeof name === 'string' && name.length > 0
    );
}

function getSupabaseAuthStorageKeys(
  urlOrUrls: string | string[] | null | undefined
) {
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  const storageKeys = new Set<string>();

  for (const url of urls) {
    if (!url) {
      continue;
    }

    try {
      storageKeys.add(getSupabaseAuthStorageKey(url));
    } catch {
      // Ignore invalid optional URLs. Required Supabase URLs are validated
      // before this helper is called.
    }
  }

  return storageKeys;
}

function getAuthCookiesForStorageKey(
  cookies: CookieLike[],
  storageKey: string
) {
  return cookies.filter(
    (cookie) => getChunkIndex(cookie.name, storageKey) !== null
  );
}

function isAuthCookieForAnyStorageKey(
  cookieName: string,
  storageKeys: Iterable<string>
) {
  return [...storageKeys].some(
    (storageKey) => getChunkIndex(cookieName, storageKey) !== null
  );
}

function clearAuthCookies(
  authCookies: CookieLike[],
  clearCookie: ClearCookie | undefined
) {
  for (const cookie of authCookies) {
    clearCookie?.(cookie.name, EXPIRED_COOKIE_OPTIONS);
  }
}

function getValidAuthCookieGroup(
  cookies: CookieLike[],
  storageKey: string,
  clearCookie?: ClearCookie
): ValidAuthCookieGroup | null {
  const authCookies = getAuthCookiesForStorageKey(cookies, storageKey);

  if (authCookies.length === 0) {
    return null;
  }

  const { duplicateNames, normalizedCookies } =
    dedupeAuthCookiesByName(authCookies);
  const combinedValue = combineAuthCookieChunks(normalizedCookies, storageKey);
  const malformedChunkLayout = hasMalformedChunkLayout(
    normalizedCookies,
    storageKey
  );
  const isValid =
    (!combinedValue && !malformedChunkLayout) ||
    (combinedValue &&
      !malformedChunkLayout &&
      !isMalformedSupabaseCookieValue(combinedValue));

  if (!isValid) {
    clearAuthCookies(authCookies, clearCookie);
    return null;
  }

  for (const name of duplicateNames) {
    clearCookie?.(name, EXPIRED_COOKIE_OPTIONS);
  }

  return {
    normalizedCookies,
    storageKey,
  };
}

function renameAuthCookieStorageKey(
  cookieName: string,
  fromStorageKey: string,
  toStorageKey: string
) {
  if (cookieName === fromStorageKey) {
    return toStorageKey;
  }

  return `${toStorageKey}${cookieName.slice(fromStorageKey.length)}`;
}

export function getDuplicateSupabaseAuthCookieNames(
  cookieHeader: string | null | undefined,
  url: string | string[] | null | undefined
) {
  const storageKeys = getSupabaseAuthStorageKeys(url);

  if (storageKeys.size === 0) {
    return [];
  }

  const seenNames = new Set<string>();
  const duplicateNames = new Set<string>();

  for (const name of getCookieHeaderNames(cookieHeader)) {
    const isSupabaseAuthCookie = [...storageKeys].some(
      (storageKey) => getChunkIndex(name, storageKey) !== null
    );

    if (!isSupabaseAuthCookie) {
      continue;
    }

    if (seenNames.has(name)) {
      duplicateNames.add(name);
    }

    seenNames.add(name);
  }

  return [...duplicateNames];
}

export function getSupabaseAuthCookieNames(
  cookieHeader: string | null | undefined,
  url: string | string[] | null | undefined
) {
  const storageKeys = getSupabaseAuthStorageKeys(url);

  if (storageKeys.size === 0) {
    return [];
  }

  const authCookieNames = new Set<string>();

  for (const name of getCookieHeaderNames(cookieHeader)) {
    const isSupabaseAuthCookie = [...storageKeys].some(
      (storageKey) => getChunkIndex(name, storageKey) !== null
    );

    if (isSupabaseAuthCookie) {
      authCookieNames.add(name);
    }
  }

  return [...authCookieNames];
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
  url: string | string[],
  clearCookie?: ClearCookie,
  mirrorCookie?: MirrorCookie
): CookieLike[] {
  const storageKeys = getSupabaseAuthStorageKeys(url);
  const canonicalStorageKey = [...storageKeys][0];

  if (!canonicalStorageKey) {
    return cookies;
  }

  const nonAuthCookies = cookies.filter(
    (cookie) => !isAuthCookieForAnyStorageKey(cookie.name, storageKeys)
  );
  const validGroups = [...storageKeys]
    .map((storageKey) =>
      getValidAuthCookieGroup(cookies, storageKey, clearCookie)
    )
    .filter((group): group is ValidAuthCookieGroup => group !== null);

  if (validGroups.length === 0) {
    const hasKnownAuthCookies = cookies.some((cookie) =>
      isAuthCookieForAnyStorageKey(cookie.name, storageKeys)
    );

    return hasKnownAuthCookies ? nonAuthCookies : cookies;
  }

  const canonicalGroup = validGroups.find(
    (group) => group.storageKey === canonicalStorageKey
  );
  const selectedGroup = canonicalGroup ?? validGroups[0];
  if (!selectedGroup) {
    return nonAuthCookies;
  }

  for (const group of validGroups) {
    if (group.storageKey === selectedGroup.storageKey) {
      continue;
    }

    clearAuthCookies(group.normalizedCookies, clearCookie);
  }

  if (selectedGroup.storageKey === canonicalStorageKey) {
    return nonAuthCookies.concat(selectedGroup.normalizedCookies);
  }

  const mirroredCookies = selectedGroup.normalizedCookies.map((cookie) => ({
    ...cookie,
    name: renameAuthCookieStorageKey(
      cookie.name,
      selectedGroup.storageKey,
      canonicalStorageKey
    ),
  }));

  for (const cookie of mirroredCookies) {
    mirrorCookie?.(cookie.name, cookie.value);
  }

  clearAuthCookies(selectedGroup.normalizedCookies, clearCookie);

  return nonAuthCookies.concat(mirroredCookies);
}

export function isSupabaseAuthCookieNameForUrls(
  cookieName: string,
  url: string | string[] | null | undefined
) {
  return isAuthCookieForAnyStorageKey(
    cookieName,
    getSupabaseAuthStorageKeys(url)
  );
}

export function isCanonicalSupabaseAuthCookieNameForUrls(
  cookieName: string,
  url: string | string[] | null | undefined
) {
  const [canonicalStorageKey] = getSupabaseAuthStorageKeys(url);

  return canonicalStorageKey
    ? getChunkIndex(cookieName, canonicalStorageKey) !== null
    : false;
}

export function getNonCanonicalSupabaseAuthCookieNames(
  cookieHeader: string | null | undefined,
  url: string | string[] | null | undefined
) {
  const storageKeys = getSupabaseAuthStorageKeys(url);
  const [canonicalStorageKey] = storageKeys;

  if (!canonicalStorageKey) {
    return [];
  }

  const names = new Set<string>();

  for (const name of getCookieHeaderNames(cookieHeader)) {
    if (
      getChunkIndex(name, canonicalStorageKey) === null &&
      isAuthCookieForAnyStorageKey(name, storageKeys)
    ) {
      names.add(name);
    }
  }

  return [...names];
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

  const { normalizedCookies } = dedupeAuthCookiesByName(authCookies);
  const combinedValue = combineAuthCookieChunks(normalizedCookies, storageKey);
  const malformedChunkLayout = hasMalformedChunkLayout(
    normalizedCookies,
    storageKey
  );
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
