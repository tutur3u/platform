/**
 * Trusted-proxy client IP resolution.
 *
 * Client IP headers (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, ...)
 * are only meaningful when a known proxy in front of the app sets or
 * overwrites them. Reading them unconditionally lets any caller pick the
 * address used for rate limits, IP blocks, and audit logs. This module only
 * trusts the headers of the proxy the deployment is configured to sit behind.
 *
 * Portable: no framework or runtime imports. Callers may inject the env and
 * runtime hints; the defaults read `process.env` and `navigator` when present.
 */

/** Shared, conservative bucket used whenever no trusted client IP exists. */
export const UNKNOWN_CLIENT_IP = 'unknown';

export const TRUSTED_PROXY_ENV = 'TRUSTED_PROXY';
export const TRUSTED_PROXY_HOPS_ENV = 'TRUSTED_PROXY_HOPS';

export const TRUSTED_PROXY_MODES = [
  'cloudflare',
  'vercel',
  'forwarded',
  'none',
] as const;

export type TrustedProxyMode = (typeof TRUSTED_PROXY_MODES)[number];

export interface ClientIpConfig {
  mode: TrustedProxyMode;
  /**
   * Number of trusted reverse proxies that append to `x-forwarded-for`
   * (`forwarded` mode only). The client is the entry `hops` positions from
   * the right; anything further left is client-supplied and ignored.
   */
  trustedHops: number;
}

export type ClientIpHeaders =
  | Headers
  | Map<string, string>
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | null | undefined>;

export type ClientIpEnv = Record<string, string | undefined>;

export interface ResolveTrustedProxyOptions {
  env?: ClientIpEnv;
  /** Runtime user agent; `Cloudflare-Workers` selects the Cloudflare mode. */
  runtimeUserAgent?: string | null;
}

const MAX_TRUSTED_HOPS = 10;
const invalidModeWarnings = new Set<string>();

function defaultEnv(): ClientIpEnv {
  const processLike = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return processLike?.env ?? {};
}

function defaultRuntimeUserAgent(): string | null {
  const navigatorLike = (globalThis as { navigator?: { userAgent?: unknown } })
    .navigator;
  return typeof navigatorLike?.userAgent === 'string'
    ? navigatorLike.userAgent
    : null;
}

function isTrustedProxyMode(value: string): value is TrustedProxyMode {
  return (TRUSTED_PROXY_MODES as readonly string[]).includes(value);
}

function parseTrustedHops(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_TRUSTED_HOPS);
}

/**
 * Resolve which proxy headers this deployment may trust.
 *
 * Precedence: explicit `TRUSTED_PROXY`; otherwise Vercel when the platform
 * env markers are present; otherwise Cloudflare when running inside a Worker;
 * otherwise `none` (every request shares the unknown bucket).
 */
export function resolveTrustedProxyConfig(
  options: ResolveTrustedProxyOptions = {}
): ClientIpConfig {
  const env = options.env ?? defaultEnv();
  const trustedHops = parseTrustedHops(env[TRUSTED_PROXY_HOPS_ENV]);
  const explicit = env[TRUSTED_PROXY_ENV]?.trim().toLowerCase();

  if (explicit) {
    if (isTrustedProxyMode(explicit)) {
      return { mode: explicit, trustedHops };
    }
    if (!invalidModeWarnings.has(explicit)) {
      invalidModeWarnings.add(explicit);
      console.warn(
        `[client-ip] Ignoring unsupported ${TRUSTED_PROXY_ENV} value; expected one of ${TRUSTED_PROXY_MODES.join(', ')}. No proxy headers are trusted.`
      );
    }
    return { mode: 'none', trustedHops };
  }

  if (env.VERCEL || env.VERCEL_ENV) {
    return { mode: 'vercel', trustedHops };
  }

  const userAgent =
    options.runtimeUserAgent === undefined
      ? defaultRuntimeUserAgent()
      : options.runtimeUserAgent;
  if (userAgent === 'Cloudflare-Workers') {
    return { mode: 'cloudflare', trustedHops };
  }

  return { mode: 'none', trustedHops };
}

function readHeader(headers: ClientIpHeaders, name: string): string | null {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name);
  }
  if (headers instanceof Map) {
    return headers.get(name) ?? null;
  }
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (
      (headers as { get(name: string): string | null | undefined }).get(name) ??
      null
    );
  }

  const record = headers as Record<
    string,
    string | string[] | null | undefined
  >;
  let value = record[name];
  if (value === undefined) {
    const match = Object.keys(record).find((key) => key.toLowerCase() === name);
    value = match ? record[match] : undefined;
  }
  if (Array.isArray(value)) return value.join(', ');
  return value ?? null;
}

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

function isValidIpv6(value: string): boolean {
  if (value.length > 45) return false;

  let groups = value;
  let maxGroups = 8;
  const lastColon = groups.lastIndexOf(':');
  const tail = groups.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!IPV4_PATTERN.test(tail)) return false;
    groups = `${groups.slice(0, lastColon + 1)}0`;
    maxGroups = 7;
  }

  const halves = groups.split('::');
  if (halves.length > 2) return false;

  const parseHalf = (half: string) => (half === '' ? [] : half.split(':'));
  const head = parseHalf(halves[0] ?? '');
  const rest = halves.length === 2 ? parseHalf(halves[1] ?? '') : [];
  const all = [...head, ...rest];
  if (!all.every((group) => IPV6_GROUP_PATTERN.test(group))) return false;

  // The IPv4 tail occupies two 16-bit groups but was replaced by one.
  const groupCount = all.length + (maxGroups === 7 ? 1 : 0);
  return halves.length === 2 ? groupCount < 8 : groupCount === 8;
}

/** Validate an IPv4 or IPv6 address literal. */
export function isValidIpAddress(value: string): boolean {
  if (!value) return false;
  if (IPV4_PATTERN.test(value)) return true;
  return value.includes(':') && isValidIpv6(value);
}

/**
 * Normalise a single header entry: trim, strip IPv6 brackets/zone ids and an
 * IPv4 `:port` suffix, lowercase IPv6. Returns null when it is not an IP.
 */
export function normalizeClientIp(raw: string | null | undefined) {
  let value = raw?.trim();
  if (!value) return null;

  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) {
    value = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }

  const zoneIndex = value.indexOf('%');
  if (zoneIndex > 0 && value.includes(':')) {
    value = value.slice(0, zoneIndex);
  }

  if (!isValidIpAddress(value)) return null;
  return value.includes(':') ? value.toLowerCase() : value;
}

function forwardedEntries(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Pick the client from an `x-forwarded-for` chain where the right-most
 * `trustedHops` entries were appended by trusted proxies. Never scans further
 * left: those entries are caller-controlled.
 */
export function pickForwardedClientIp(
  value: string | null,
  trustedHops: number
): string | null {
  const entries = forwardedEntries(value);
  const index = entries.length - Math.max(1, trustedHops);
  if (index < 0) return null;
  return normalizeClientIp(entries[index]);
}

function resolveForMode(
  headers: ClientIpHeaders,
  config: ClientIpConfig
): string | null {
  switch (config.mode) {
    case 'cloudflare':
      // Cloudflare's edge overwrites this header on every proxied request.
      return normalizeClientIp(readHeader(headers, 'cf-connecting-ip'));
    case 'vercel': {
      // Vercel overwrites these headers and does not forward external IPs.
      // `x-vercel-forwarded-for` survives a proxy placed in front of Vercel.
      for (const name of [
        'x-vercel-forwarded-for',
        'x-real-ip',
        'x-forwarded-for',
      ]) {
        const value = readHeader(headers, name);
        if (value) return pickForwardedClientIp(value, 1);
      }
      return null;
    }
    case 'forwarded': {
      const forwardedFor = readHeader(headers, 'x-forwarded-for');
      if (forwardedFor) {
        return pickForwardedClientIp(forwardedFor, config.trustedHops);
      }
      // A single trusted reverse proxy (e.g. nginx `$remote_addr`) may set
      // only `x-real-ip`; it is overwritten by that proxy, not appended to.
      return config.trustedHops === 1
        ? normalizeClientIp(readHeader(headers, 'x-real-ip'))
        : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve the client IP from trusted proxy headers only.
 *
 * Returns {@link UNKNOWN_CLIENT_IP} when the configured proxy did not supply a
 * valid address, so callers rate-limit and block-check a shared bucket instead
 * of skipping those checks.
 */
export function resolveClientIp(
  headers: ClientIpHeaders,
  config: ClientIpConfig = resolveTrustedProxyConfig()
): string {
  return resolveForMode(headers, config) ?? UNKNOWN_CLIENT_IP;
}
