/**
 * App-switch time-to-interactive (ASI) measurement for the one-origin
 * super-app (docs: platform/architecture/one-origin-super-app#metrics).
 *
 * The source app writes a 30-second cookie with the click time when a link
 * leads to another app. The destination reads it once its UI is ready and
 * beacons the elapsed time. A cookie on the parent domain survives the
 * subdomain baseline (including auth-handoff redirects) and the shared origin.
 *
 * Payloads carry no user, URL or workspace identifiers.
 *
 * Portable: no framework or runtime imports.
 */

export const APP_SWITCH_COOKIE = 'ttr_switch';
export const APP_SWITCH_MAX_AGE_SECONDS = 30;
/** Largest accepted beacon body, in bytes. */
export const APP_SWITCH_MAX_BODY_BYTES = 1024;
const MAX_DURATION_MS = APP_SWITCH_MAX_AGE_SECONDS * 1000;
const APP_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const SHORT_TEXT = /^[A-Za-z0-9./_-]{0,16}$/u;

export type AppSwitchTopology = 'subdomain' | 'one-origin';

export interface AppSwitchStart {
  from: string;
  epochMs: number;
}

export interface AppSwitchSample {
  from: string;
  to: string;
  topology: AppSwitchTopology;
  /** Click to the destination's `ttr:app-ready`, in milliseconds. */
  durationMs: number;
  prerendered: boolean;
  /** Whether a cross-app sign-in handoff ran during the switch. */
  handoff: boolean;
  /** `nextHopProtocol` of the destination document (`h2`, `h3`, ...). */
  protocol: string;
  /** TCP+TLS setup of the destination document; 0 when reused. */
  connectMs: number;
  /** Network Information `effectiveType`, or empty. */
  effectiveType: string;
}

export function isAppSlug(value: unknown): value is string {
  return typeof value === 'string' && APP_PATTERN.test(value);
}

/**
 * `Set-Cookie`/`document.cookie` value recording a switch away from `from`.
 * `domain` is the parent domain shared by every app host (`.tuturuuu.com`).
 */
export function serializeAppSwitchStart(
  from: string,
  epochMs: number,
  options: { domain?: string; secure?: boolean } = {}
): string | null {
  if (!isAppSlug(from) || !Number.isSafeInteger(epochMs) || epochMs < 0)
    return null;
  return [
    `${APP_SWITCH_COOKIE}=${epochMs}.${from}`,
    'Path=/',
    `Max-Age=${APP_SWITCH_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    ...(options.domain ? [`Domain=${options.domain}`] : []),
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}

/** Cookie value that removes the start marker. */
export function clearAppSwitchStart(options: { domain?: string } = {}) {
  return [
    `${APP_SWITCH_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
    ...(options.domain ? [`Domain=${options.domain}`] : []),
  ].join('; ');
}

/** Read a fresh start marker from a `Cookie` header or `document.cookie`. */
export function parseAppSwitchStart(
  cookies: string | null | undefined,
  nowMs: number
): AppSwitchStart | null {
  const raw = cookies
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_SWITCH_COOKIE}=`))
    ?.slice(APP_SWITCH_COOKIE.length + 1);
  const match = raw ? /^(\d{1,15})\.([a-z][a-z0-9-]{0,31})$/u.exec(raw) : null;
  if (!match?.[1] || !match[2]) return null;
  const epochMs = Number(match[1]);
  const age = nowMs - epochMs;
  if (age < 0 || age > MAX_DURATION_MS) return null;
  return { from: match[2], epochMs };
}

/**
 * Validate a sample from an untrusted beacon. Unknown fields are dropped and
 * any out-of-range value rejects the whole sample.
 */
export function parseAppSwitchSample(value: unknown): AppSwitchSample | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const durationMs = input.durationMs;
  const connectMs = input.connectMs;
  if (
    !isAppSlug(input.from) ||
    !isAppSlug(input.to) ||
    input.from === input.to ||
    (input.topology !== 'subdomain' && input.topology !== 'one-origin') ||
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_DURATION_MS ||
    typeof connectMs !== 'number' ||
    !Number.isFinite(connectMs) ||
    connectMs < 0 ||
    connectMs > MAX_DURATION_MS ||
    typeof input.prerendered !== 'boolean' ||
    typeof input.handoff !== 'boolean' ||
    typeof input.protocol !== 'string' ||
    !SHORT_TEXT.test(input.protocol) ||
    typeof input.effectiveType !== 'string' ||
    !SHORT_TEXT.test(input.effectiveType)
  )
    return null;
  return {
    from: input.from,
    to: input.to,
    topology: input.topology,
    durationMs: Math.round(durationMs),
    prerendered: input.prerendered,
    handoff: input.handoff,
    protocol: input.protocol,
    connectMs: Math.round(connectMs),
    effectiveType: input.effectiveType,
  };
}

/** Workers Analytics Engine data point; `indexes` samples by destination. */
export function appSwitchDataPoint(sample: AppSwitchSample, country = '') {
  return {
    indexes: [sample.to],
    blobs: [
      sample.from,
      sample.to,
      sample.topology,
      sample.prerendered ? '1' : '0',
      sample.handoff ? '1' : '0',
      sample.protocol,
      sample.effectiveType,
      SHORT_TEXT.test(country) ? country : '',
    ],
    doubles: [sample.durationMs, sample.connectMs],
  };
}

export interface AnalyticsEngineWriter {
  writeDataPoint(point: ReturnType<typeof appSwitchDataPoint>): void;
}

/** Apps served under a path on the shared origin. */
export const ONE_ORIGIN_APP_SLUGS: readonly string[] = ['meet', 'mail'];
/** App slug used for Web (`tuturuuu.com` outside any mounted app path). */
export const PLATFORM_APP_SLUG = 'platform';
const SHARED_HOSTNAMES = new Set(['tuturuuu.com', 'tuturuuu.localhost']);

/** The mounted app that owns `pathname` on the shared origin, if any. */
export function mountedAppForPath(pathname: string): string | null {
  return (
    ONE_ORIGIN_APP_SLUGS.find(
      (slug) => pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)
    ) ?? null
  );
}

/**
 * Which app a URL belongs to: a mounted path on the shared origin, Web on the
 * rest of it, or the app registered for its hostname.
 */
export function resolveUrlApp(
  url: URL,
  appForHostname: (hostname: string) => string | null | undefined
): string | null {
  if (SHARED_HOSTNAMES.has(url.hostname))
    return mountedAppForPath(url.pathname) ?? PLATFORM_APP_SLUG;
  const app = appForHostname(url.hostname);
  return isAppSlug(app) ? app : null;
}

/** `one-origin` when the page is a mounted app on the shared origin. */
export function resolveTopology(url: URL): AppSwitchTopology {
  return SHARED_HOSTNAMES.has(url.hostname) && mountedAppForPath(url.pathname)
    ? 'one-origin'
    : 'subdomain';
}

/** Cloudflare's two-letter country for the request, when present. */
export function readCountry(request: Request): string | undefined {
  const country = (request as Request & { cf?: { country?: unknown } }).cf
    ?.country;
  return typeof country === 'string' ? country : undefined;
}
