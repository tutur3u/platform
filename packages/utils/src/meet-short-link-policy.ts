/**
 * Meeting short links on ttr.gg. Framework-free rules shared by the Web API,
 * Meet UI and tests; the database guard trigger enforces the same namespace.
 */

export const MEET_SHORT_LINK_ORIGIN = 'https://ttr.gg';
export const MEET_SHORT_LINK_DOMAIN = 'ttr.gg';
export const MEET_SHORT_LINK_PREFIX = 'meet';
export const MEET_CANONICAL_JOIN_ORIGIN = 'https://tuturuuu.com/meet';

/**
 * Server flag that turns meeting short links on. Keep it unset until
 * `ttr.gg` serves `/meet/{code}` (the native Shortener Worker); every other
 * value keeps the canonical tuturuuu.com/meet link for everyone.
 */
export const MEET_SHORT_LINKS_ENABLED_ENV = 'MEET_SHORT_LINKS_ENABLED';

export function meetShortLinksEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[MEET_SHORT_LINKS_ENABLED_ENV] === 'true';
}

export const MEET_GENERATED_CODE_LENGTH = 7;
export const MEET_GENERATED_TTL_DAYS = 30;
export const MEET_VANITY_TTL_DAYS = 365;
export const MEET_VANITY_MIN_LENGTH = 3;
export const MEET_VANITY_MAX_LENGTH = 40;
export const MEET_VANITY_PER_MEETING = 5;
export const MEET_GENERATED_PER_HOUR = 20;
export const MEET_VANITY_CHANGES_PER_HOUR = 10;

const DAY_MS = 86_400_000;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const VANITY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** Root slugs share the global ttr.gg namespace with shortener routes. */
export const MEET_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'about',
  'account',
  'admin',
  'api',
  'app',
  'apps',
  'assets',
  'auth',
  'billing',
  'blog',
  'calendar',
  'contact',
  'contacts',
  'dashboard',
  'docs',
  'drive',
  'edufest',
  'help',
  'home',
  'link',
  'links',
  'login',
  'logout',
  'mail',
  'meet',
  'meeting',
  'meetings',
  'null',
  'pay',
  'privacy',
  'qr',
  'root',
  'security',
  'settings',
  'shortener',
  'signin',
  'signup',
  'staff',
  'status',
  'support',
  'tasks',
  'terms',
  'ttr',
  'tuturuuu',
  'undefined',
  'verify',
  'www',
]);

export type MeetShortLinkKind = 'generated' | 'vanity';

export type VanitySlugError = 'length' | 'charset' | 'hyphen' | 'reserved';

/** Draw a base62 code with rejection sampling, so every symbol is uniform. */
export function generateMeetShortCode(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    crypto.getRandomValues(bytes)
): string {
  let code = '';
  while (code.length < MEET_GENERATED_CODE_LENGTH) {
    for (const byte of random(new Uint8Array(16))) {
      // 248 = 62 * 4: bytes at or above it would bias the first symbols.
      if (byte >= 248) continue;
      code += BASE62[byte % 62];
      if (code.length === MEET_GENERATED_CODE_LENGTH) break;
    }
  }
  return code;
}

export function validateVanitySlug(slug: string): VanitySlugError | null {
  if (
    slug.length < MEET_VANITY_MIN_LENGTH ||
    slug.length > MEET_VANITY_MAX_LENGTH
  )
    return 'length';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'charset';
  if (!VANITY_PATTERN.test(slug) || slug.includes('--')) return 'hyphen';
  if (MEET_RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

/** Stored `shortened_links.slug`: `meet/{code}` unless staff drop the prefix. */
export function meetStoredSlug(code: string, prefixed: boolean): string {
  return prefixed ? `${MEET_SHORT_LINK_PREFIX}/${code}` : code;
}

export function meetSlugCode(slug: string): {
  code: string;
  prefixed: boolean;
} {
  const prefix = `${MEET_SHORT_LINK_PREFIX}/`;
  return slug.startsWith(prefix)
    ? { code: slug.slice(prefix.length), prefixed: true }
    : { code: slug, prefixed: false };
}

export function meetShortLinkUrl(slug: string): string {
  return `${MEET_SHORT_LINK_ORIGIN}/${slug}`;
}

/** The only destination a meeting short link may store. */
export function meetCanonicalJoinUrl(wsId: string, meetingId: string): string {
  return `${MEET_CANONICAL_JOIN_ORIGIN}/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}`;
}

/** Generated links last 30 days past the later of now and the meeting time. */
export function meetGeneratedExpiry(
  meetingTime: string | null | undefined,
  now: number = Date.now()
): string {
  const scheduled = meetingTime ? Date.parse(meetingTime) : Number.NaN;
  const base = Number.isFinite(scheduled) ? Math.max(now, scheduled) : now;
  return new Date(base + MEET_GENERATED_TTL_DAYS * DAY_MS).toISOString();
}

export function meetVanityExpiry(now: number = Date.now()): string {
  return new Date(now + MEET_VANITY_TTL_DAYS * DAY_MS).toISOString();
}

export function isMeetLinkExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= now;
}
