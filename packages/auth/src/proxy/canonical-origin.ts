import {
  isAuthenticatedCloudflareOrigin,
  resolveTrustedProxyConfig,
} from '@tuturuuu/utils/abuse-protection/client-ip';
import type { NextRequest } from 'next/server';

/**
 * Public origin resolution for auth return URLs (SR-XFH-RETURN).
 *
 * The origin returned here becomes the `/verify-token` return target that the
 * central login page sends the browser back to. Request headers decide it only
 * when they are trustworthy:
 *
 * - `X-Forwarded-Host` (and a non-internal `Host`) is honoured only when the
 *   request carries a verified gateway origin proof (`x-tuturuuu-origin-auth`)
 *   or names a host in the app's configured canonical origins. Cloudflare
 *   passes a client-supplied `X-Forwarded-Host` through, so the header alone
 *   proves nothing.
 * - `X-Forwarded-Proto` is honoured only together with a proof-trusted
 *   forwarded host, and only as `http` or `https`. A canonical host match
 *   returns the configured origin verbatim, so a client cannot downgrade it.
 * - Everything else falls back to the app's own canonical origin (the first
 *   valid configured origin), never to a header value and never to the central
 *   app. With no valid configured origin the result is `null`, and callers
 *   send the browser to central login without a return URL.
 * - Local development keeps its explicit loopback port so each satellite
 *   returns to its own verifier.
 */

const INTERNAL_HOSTNAME_PATTERN =
  /^(?:0\.0\.0\.0|127(?:\.\d+){0,3}|localhost|::1|\[::1\]|host\.docker\.internal)$/u;

/**
 * Hostnames that serve the central web app only behind the tuturuuu.com
 * gateway Worker (its WEB_ORIGIN). The hosting platform overwrites
 * X-Forwarded-Host with this hostname, so a public URL built from it would send
 * browsers to a host they cannot use. Such requests resolve to the app's
 * canonical origin instead. Extra aliases come from
 * TUTURUUU_GATEWAY_ORIGIN_HOSTS (comma-separated hostnames).
 */
const GATEWAY_ORIGIN_ALIAS_HOSTNAMES = ['origin.tuturuuu.com'] as const;

export function extractForwardedHeaderValue(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return firstValue || null;
}

export function isInternalHostname(hostname: string): boolean {
  return INTERNAL_HOSTNAME_PATTERN.test(hostname);
}

export function isLoopbackBrowserHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    /^127(?:\.\d+){0,3}$/u.test(hostname)
  );
}

function isGatewayOriginAliasHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    (GATEWAY_ORIGIN_ALIAS_HOSTNAMES as readonly string[]).includes(normalized)
  ) {
    return true;
  }
  const extra = process.env.TUTURUUU_GATEWAY_ORIGIN_HOSTS;
  if (!extra) return false;
  return extra
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

function toHttpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Valid configured canonical origins, in order, without duplicates. */
export function normalizeCanonicalOrigins(
  canonicalOrigins: readonly string[] | null | undefined
): string[] {
  const origins: string[] = [];
  for (const candidate of canonicalOrigins ?? []) {
    const origin = toHttpOrigin(candidate);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

function parseHostOrigin(protocol: string, host: string): URL | null {
  try {
    const url = new URL(`${protocol}://${host}`);
    // A host header value must be exactly `hostname[:port]`.
    if (url.pathname !== '/' || url.username || url.password) return null;
    if (url.host.toLowerCase() !== host.toLowerCase()) return null;
    return url;
  } catch {
    return null;
  }
}

function hasVerifiedGatewayOriginProof(req: NextRequest): boolean {
  try {
    return isAuthenticatedCloudflareOrigin(
      req.headers,
      resolveTrustedProxyConfig()
    );
  } catch {
    return false;
  }
}

/**
 * Returns the configured canonical origin whose host matches `host`, if any.
 * The configured origin is returned verbatim so its protocol always wins.
 */
function matchCanonicalHost(
  host: string,
  trustedOrigins: readonly string[]
): string | null {
  const normalized = host.toLowerCase();
  return (
    trustedOrigins.find(
      (origin) => new URL(origin).host.toLowerCase() === normalized
    ) ?? null
  );
}

export function resolveCanonicalRequestOrigin(
  req: NextRequest,
  webAppUrl: string,
  canonicalOrigins: readonly string[]
): string | null {
  const appOrigins = normalizeCanonicalOrigins(canonicalOrigins);
  const fallbackOrigin = appOrigins[0] ?? null;
  const centralOrigin = toHttpOrigin(webAppUrl);
  const trustedOrigins = centralOrigin
    ? [...appOrigins, centralOrigin]
    : appOrigins;

  let proofChecked = false;
  let proofValid = false;
  const hasProof = () => {
    if (!proofChecked) {
      proofChecked = true;
      proofValid = hasVerifiedGatewayOriginProof(req);
    }
    return proofValid;
  };

  const forwardedHost = extractForwardedHeaderValue(
    req.headers.get('x-forwarded-host')
  );

  if (forwardedHost) {
    const forwardedUrl = parseHostOrigin('https', forwardedHost);
    if (!forwardedUrl) {
      return fallbackOrigin;
    }

    const forwardedHostname = forwardedUrl.hostname;
    if (isGatewayOriginAliasHostname(forwardedHostname)) {
      return fallbackOrigin;
    }

    if (!isInternalHostname(forwardedHostname)) {
      const canonicalMatch = matchCanonicalHost(
        forwardedUrl.host,
        trustedOrigins
      );
      if (canonicalMatch) {
        return canonicalMatch;
      }

      if (hasProof()) {
        const forwardedProto = extractForwardedHeaderValue(
          req.headers.get('x-forwarded-proto')
        )?.toLowerCase();
        const protocol =
          forwardedProto === 'http' || forwardedProto === 'https'
            ? forwardedProto
            : 'https';
        return parseHostOrigin(protocol, forwardedHost)?.origin ?? null;
      }

      // An unproven forwarded host is client-controlled: never reflect it.
      return fallbackOrigin;
    }
    // Internal forwarded hosts carry no public identity; use the request URL.
  }

  const requestHostname = req.nextUrl.hostname;

  if (isGatewayOriginAliasHostname(requestHostname)) {
    return fallbackOrigin;
  }

  if (!isInternalHostname(requestHostname)) {
    const canonicalMatch = matchCanonicalHost(req.nextUrl.host, trustedOrigins);
    if (canonicalMatch) {
      return canonicalMatch;
    }
    if (hasProof()) {
      return req.nextUrl.origin;
    }
    return fallbackOrigin;
  }

  // Local development runs each first-party app on a distinct loopback port.
  // Preserve that explicit browser-facing origin so a satellite returns to its
  // own verifier instead of the central app's verifier. Internal/container
  // hosts without this loopback shape still use the configured fallback.
  if (isLoopbackBrowserHostname(requestHostname) && req.nextUrl.port.length) {
    return req.nextUrl.origin;
  }
  return fallbackOrigin;
}
