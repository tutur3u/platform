export type AuthCookieScope = 'host-only' | 'parent-domain';

function getCookieConfiguration() {
  try {
    // Keep literal public env reads for Next build-time substitution. Public SDK
    // consumers can also run without Node's process global.
    return {
      prefix: process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX ?? '',
      scope: process.env.NEXT_PUBLIC_AUTH_COOKIE_SCOPE ?? '',
    };
  } catch (error) {
    if (typeof process !== 'undefined') throw error;
    return { prefix: '', scope: '' };
  }
}

export function getAuthCookieScope(
  defaultScope: AuthCookieScope = 'parent-domain'
): AuthCookieScope {
  const { scope, prefix } = getCookieConfiguration();
  if (!scope) return prefix ? 'host-only' : defaultScope;
  if (scope === 'host-only' || scope === 'parent-domain') return scope;
  throw new Error(
    'NEXT_PUBLIC_AUTH_COOKIE_SCOPE must be host-only or parent-domain'
  );
}

function getAuthCookiePrefix() {
  const { prefix } = getCookieConfiguration();
  if (!/^[A-Za-z0-9_-]{0,64}$/.test(prefix)) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX must contain at most 64 cookie-safe letters, digits, underscores or hyphens'
    );
  }
  if (
    prefix &&
    (!/[-_]$/.test(prefix) ||
      /^(?:sb-|tuturuuu_|ttr_)/i.test(
        prefix.replace(/^__(?:Host|Secure)-/, '')
      ))
  ) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX must end in - or _ and must not start with sb-, tuturuuu_ or ttr_'
    );
  }
  if (
    /^__(?:Host|Secure)-/.test(prefix) &&
    !/[A-Za-z0-9]/.test(prefix.replace(/^__(?:Host|Secure)-/, ''))
  ) {
    throw new Error(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX with __Host- or __Secure- requires a non-empty namespace segment'
    );
  }
  if (prefix.startsWith('__Host-') && getAuthCookieScope() !== 'host-only') {
    throw new Error(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX with __Host- requires host-only scope'
    );
  }
  return prefix;
}

export function getAuthCookieName(name: string) {
  const prefix = getAuthCookiePrefix();
  for (const reserved of ['__Host-', '__Secure-']) {
    if (name.startsWith(reserved) && !prefix.startsWith(reserved)) {
      return `${reserved}${prefix}${name.slice(reserved.length)}`;
    }
  }
  return `${prefix}${name}`;
}

export function stripAuthCookiePrefix(name: string): string | null {
  const prefix = getAuthCookiePrefix();
  return name.startsWith(prefix) ? name.slice(prefix.length) : null;
}

export function authCookieRequiresSecure() {
  const prefix = getAuthCookiePrefix();
  return prefix.startsWith('__Host-') || prefix.startsWith('__Secure-');
}

export function getSupabaseAuthCookiePattern(flags = 'u') {
  return new RegExp(
    `^${getAuthCookiePrefix()}sb-[A-Za-z0-9-]+-auth-token(?:\\.\\d+)?$`,
    flags
  );
}

export function getSupabaseAuthStorageKey(url: string): string {
  return getAuthCookieName(
    `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  );
}
