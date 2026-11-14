import {
  type ClientIpEnv,
  type ClientIpHeaders,
  isAuthenticatedCloudflareOrigin,
  resolveTrustedProxyConfig,
} from './abuse-protection/client-ip';

/**
 * Trust model for `X-Forwarded-Host` (SR-XFH-RETURN).
 *
 * Cloudflare passes a client-supplied `X-Forwarded-Host` through, so the header
 * alone proves nothing. A forwarded host is trusted only when it names one of
 * this deployment's configured app or central origins, or when the request
 * carries a verified gateway origin proof (`x-tuturuuu-origin-auth`, in
 * `TRUSTED_PROXY=cloudflare-origin` mode). Callers ignore an untrusted
 * forwarded host and keep the request's own origin.
 *
 * Portable: no framework or runtime imports.
 */

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

function defaultEnv(): ClientIpEnv {
  const processLike = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return processLike?.env ?? {};
}

function hostnameOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[\s\r\n]/u.test(trimmed)) return null;
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
  env: ClientIpEnv = defaultEnv()
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

/** Whether the request carries a verified gateway origin proof. */
export function hasVerifiedGatewayOriginProof(
  headers: ClientIpHeaders | null | undefined,
  env?: ClientIpEnv
): boolean {
  if (!headers) return false;
  try {
    return isAuthenticatedCloudflareOrigin(
      headers,
      resolveTrustedProxyConfig(env ? { env } : {})
    );
  } catch {
    return false;
  }
}

/**
 * Hostname of a forwarded host value (`host[:port]`, first entry of a comma
 * list) when it is trusted, otherwise `null`.
 */
export function resolveTrustedForwardedHostname(
  forwardedHost: string | null | undefined,
  headers: ClientIpHeaders | null | undefined,
  env?: ClientIpEnv
): string | null {
  const first = forwardedHost
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!first || /[\s\r\n/@\\]/u.test(first)) return null;

  let hostname: string;
  try {
    const url = new URL(`http://${first}`);
    if (url.host.toLowerCase() !== first.toLowerCase()) return null;
    hostname = url.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (getConfiguredOriginHostnames(env).has(hostname)) return hostname;
  return hasVerifiedGatewayOriginProof(headers, env) ? hostname : null;
}
