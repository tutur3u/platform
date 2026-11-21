import { z } from 'zod';

/**
 * Design-review asks: the orchestrator shows the owner a mockup preview and
 * a link to the full mockup, and the owner approves or requests changes.
 * Like a login request's sign-in URL, both links are validated structurally
 * instead of scrubbed, and never point at an arbitrary origin:
 * - the full mockup opens on a claude.ai artifact page or a first-party
 *   Tuturuuu origin;
 * - the preview image is either hosted on a first-party Tuturuuu origin, or
 *   an asset the publisher uploaded (content-addressed, size-capped and
 *   content-type checked) that Web serves to the owner only.
 * Framework-free so the publisher mirror can be compared against it.
 */
export const FLEET_REVIEW_URL_MAX = 2048;
/** First-party origins: the apex and its subdomains. */
export const FLEET_REVIEW_FIRST_PARTY_HOSTS = ['tuturuuu.com'] as const;
/** claude.ai serves artifacts under these paths only. */
export const FLEET_REVIEW_ARTIFACT_HOST = 'claude.ai';
export const FLEET_REVIEW_ARTIFACT_PATHS = [
  '/artifact/',
  '/code/artifact/',
  '/public/artifacts/',
] as const;

export const FLEET_REVIEW_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type FleetReviewImageType = (typeof FLEET_REVIEW_IMAGE_TYPES)[number];
/** Raw bytes; stored base64 under the Mastermind store's 300 KiB value cap. */
export const FLEET_REVIEW_IMAGE_MAX_BYTES = 200 * 1024;
export const FLEET_REVIEW_ASSET_ID = /^[0-9a-f]{64}$/;

function firstParty(host: string) {
  if (host.startsWith('.')) return false;
  return FLEET_REVIEW_FIRST_PARTY_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

function parseHttps(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length > FLEET_REVIEW_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return null;
  if (url.hash) return null;
  return url;
}

/**
 * The normalized full-mockup link when it is safe to open: https, no
 * credentials, port or fragment, and either a claude.ai artifact path or a
 * first-party host.
 */
export function safeReviewLink(raw: string): string | null {
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const artifact =
    host === FLEET_REVIEW_ARTIFACT_HOST &&
    FLEET_REVIEW_ARTIFACT_PATHS.some((prefix) =>
      url.pathname.startsWith(prefix)
    );
  if (!artifact && !firstParty(host)) return null;
  const normalized = url.toString();
  return normalized.length > FLEET_REVIEW_URL_MAX ? null : normalized;
}

/**
 * The normalized hosted preview URL when it is safe to load: https on a
 * first-party host, no credentials, port, fragment or query, and an image
 * file extension.
 */
export function safeReviewImageUrl(raw: string): string | null {
  const url = parseHttps(raw);
  if (!url || url.search) return null;
  if (!firstParty(url.hostname.toLowerCase())) return null;
  if (!/\.(png|jpe?g|webp)$/i.test(url.pathname)) return null;
  const normalized = url.toString();
  return normalized.length > FLEET_REVIEW_URL_MAX ? null : normalized;
}

/** The image type the leading bytes prove, or null for anything else. */
export function sniffReviewImage(
  bytes: Uint8Array
): FleetReviewImageType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

const hostedPreview = z.object({
  source: z.literal('hosted'),
  url: z
    .string()
    .max(FLEET_REVIEW_URL_MAX)
    .transform((value, ctx) => {
      const safe = safeReviewImageUrl(value);
      if (!safe) {
        ctx.addIssue({ code: 'custom', message: 'image host not allowed' });
        return z.NEVER;
      }
      return safe;
    }),
});

const assetPreview = z.object({
  source: z.literal('asset'),
  /** sha256 of the image bytes, hex; the Web asset route checks it. */
  assetId: z.string().regex(FLEET_REVIEW_ASSET_ID),
  contentType: z.enum(FLEET_REVIEW_IMAGE_TYPES),
});

export const fleetReviewSchema = z.object({
  mockupUrl: z
    .string()
    .max(FLEET_REVIEW_URL_MAX)
    .transform((value, ctx) => {
      const safe = safeReviewLink(value);
      if (!safe) {
        ctx.addIssue({ code: 'custom', message: 'mockup host not allowed' });
        return z.NEVER;
      }
      return safe;
    }),
  preview: z
    .discriminatedUnion('source', [hostedPreview, assetPreview])
    .optional(),
});

export type FleetReview = z.infer<typeof fleetReviewSchema>;
