/**
 * Forwarded-host trust for Supabase auth cookie scoping (SR-XFH-RETURN).
 *
 * Cloudflare passes a client-supplied `X-Forwarded-Host` through, so the header
 * alone proves nothing. Here a forwarded host is honoured only when it names
 * one of this deployment's configured app or central origins; otherwise the
 * request's own `Host` is used. This mirrors `@tuturuuu/utils`
 * forwarded-host-trust, minus the gateway-proof leg: that verifier lives in
 * `@tuturuuu/utils`, which depends on this package, so a proven but
 * unconfigured forwarded host falls back to `Host` here (fail closed: a
 * host-scoped cookie at worst).
 *
 * Portable: no framework or runtime imports.
 */

type EnvRecord = Record<string, string | undefined>;

/** Explicit origin variables beyond the `*_APP_URL` family. */
const EXPLICIT_ORIGIN_ENV_KEYS = [
  'BASE_URL',
  'COOLIFY_FQDN',
  'COOLIFY_URL',
  'PORTLESS_URL',
  'TTR_URL',
  'VERCEL_URL',
] as const;

/** `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CALENDAR_APP_URL`, `NEXT_PUBLIC_WEB_APP_URL`, ... */
const APP_URL_ENV_KEY = /^(?:NEXT_PUBLIC_)?(?:[A-Z0-9]+_)*APP_URL$/u;

function defaultEnv(): EnvRecord {
  const processLike = (globalThis as { process?: { env?: EnvRecord } }).process;
  return processLike?.env ?? {};
}

function hostnameOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/u.test(trimmed)) return null;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Hostnames of this deployment's configured app and central origins. */
export function getConfiguredOriginHostnames(
  env: EnvRecord = defaultEnv()
): Set<string> {
  const hostnames = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (
      !APP_URL_ENV_KEY.test(key) &&
      !(EXPLICIT_ORIGIN_ENV_KEYS as readonly string[]).includes(key)
    ) {
      continue;
    }
    for (const entry of value.split(',')) {
      const hostname = hostnameOf(entry);
      if (hostname) hostnames.add(hostname);
    }
  }
  return hostnames;
}

function firstHeaderValue(value: string | null | undefined): string | null {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .find(Boolean) ?? null
  );
}

/**
 * The forwarded host (`host[:port]`) when it is well formed and names a
 * configured origin, otherwise `null`.
 */
export function resolveTrustedForwardedHost(
  forwardedHost: string | null | undefined,
  env?: EnvRecord
): string | null {
  const first = firstHeaderValue(forwardedHost);
  if (!first || /[\s/@\\]/u.test(first)) return null;
  try {
    const url = new URL(`http://${first}`);
    if (url.host.toLowerCase() !== first.toLowerCase()) return null;
    return getConfiguredOriginHostnames(env).has(url.hostname.toLowerCase())
      ? first
      : null;
  } catch {
    return null;
  }
}
