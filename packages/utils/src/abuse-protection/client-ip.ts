import { normalizeClientIp } from './ip-address';
import { verifyOriginClientIpProof } from './origin-ip-proof';

export { isValidIpAddress, normalizeClientIp } from './ip-address';
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
/** Shared secret Cloudflare injects when it proxies to the Vercel origin. */
export const TRUSTED_PROXY_ORIGIN_SECRET_ENV = 'TRUSTED_PROXY_ORIGIN_SECRET';
/** Request header carrying the origin secret or a versioned signed client-IP proof. */
export const CLOUDFLARE_ORIGIN_AUTH_HEADER = 'x-tuturuuu-origin-auth';
const MIN_ORIGIN_SECRET_LENGTH = 32;

export const TRUSTED_PROXY_MODES = [
  'cloudflare',
  'cloudflare-origin',
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
  /**
   * `cloudflare-origin` only: the shared key for apex-origin authentication
   * and signed Worker client-IP proofs. Missing or short keys never authenticate.
   */
  originAuthSecret?: string;
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

let weakOriginSecretWarned = false;

function resolveOriginAuthSecret(env: ClientIpEnv): string | undefined {
  const secret = env[TRUSTED_PROXY_ORIGIN_SECRET_ENV]?.trim();
  if (secret && secret.length >= MIN_ORIGIN_SECRET_LENGTH) return secret;
  if (!weakOriginSecretWarned) {
    weakOriginSecretWarned = true;
    console.warn(
      `[client-ip] cloudflare-origin needs ${TRUSTED_PROXY_ORIGIN_SECRET_ENV} of at least ${MIN_ORIGIN_SECRET_LENGTH} characters; Cloudflare client IPs are not trusted.`
    );
  }
  return undefined;
}

/** Comparison whose time depends only on the secret's length. */
function constantTimeEquals(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) {
    // Past the end `charCodeAt` is NaN, which `|| 0` turns into a mismatch-safe 0.
    difference |= (actual.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Whether the request came through the Cloudflare proxy that holds the
 * configured origin secret. Direct requests to the Vercel origin never pass.
 */
export function isAuthenticatedCloudflareOrigin(
  headers: ClientIpHeaders,
  config: ClientIpConfig
): boolean {
  const secret = config.originAuthSecret;
  if (
    config.mode !== 'cloudflare-origin' ||
    !secret ||
    secret.length < MIN_ORIGIN_SECRET_LENGTH
  )
    return false;
  const presented = readHeader(headers, CLOUDFLARE_ORIGIN_AUTH_HEADER) ?? '';
  return (
    verifyOriginClientIpProof({ proof: presented, secret }) !== null ||
    constantTimeEquals(presented, secret)
  );
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
    if (explicit === 'cloudflare-origin') {
      return {
        mode: explicit,
        trustedHops,
        originAuthSecret: resolveOriginAuthSecret(env),
      };
    }
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

function resolveVercelClientIp(headers: ClientIpHeaders): string | null {
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

function resolveForMode(
  headers: ClientIpHeaders,
  config: ClientIpConfig
): string | null {
  switch (config.mode) {
    case 'cloudflare':
      // Cloudflare's edge overwrites this header on every proxied request.
      return normalizeClientIp(readHeader(headers, 'cf-connecting-ip'));
    case 'cloudflare-origin': {
      const signedIp = verifyOriginClientIpProof({
        proof: readHeader(headers, CLOUDFLARE_ORIGIN_AUTH_HEADER),
        secret: config.originAuthSecret,
      });
      if (signedIp) return signedIp;
      return isAuthenticatedCloudflareOrigin(headers, config)
        ? normalizeClientIp(readHeader(headers, 'cf-connecting-ip'))
        : resolveVercelClientIp(headers);
    }
    case 'vercel':
      return resolveVercelClientIp(headers);
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
