// Design-review asks in the fleet snapshot: the full-mockup link, and a
// preview image that is either hosted on a first-party origin or a local file
// the publisher uploads to Web as a content-addressed asset. Mirrors
// apps/web/src/lib/mastermind/fleet/review.ts (a Web test compares the
// allowlists); the Web route remains the authority.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const URL_MAX = 2048;
/** Keep in sync with review.ts (a Web test compares). */
export const REVIEW_FIRST_PARTY_HOSTS = ['tuturuuu.com'];
export const REVIEW_ARTIFACT_HOST = 'claude.ai';
export const REVIEW_ARTIFACT_PATHS = [
  '/artifact/',
  '/code/artifact/',
  '/public/artifacts/',
];
export const REVIEW_IMAGE_MAX_BYTES = 200 * 1024;
export const REVIEW_DOCUMENT_TYPES = ['text/html'];
export const REVIEW_DOCUMENT_MAX_BYTES = 200 * 1024;
const DOCUMENT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.html$/i;
const PREVIEW_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|webp)$/i;
const ASSET_PATH = '/api/v1/mastermind/fleet/review-assets/';
/** Uploads per run, so a burst of new reviews cannot eat the tick budget. */
const UPLOADS_PER_RUN = 3;
/** Web keeps an asset 7 days; upload again well before it lapses. */
const REUPLOAD_MS = 3 * 24 * 60 * 60 * 1000;

const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;

function firstParty(host) {
  if (host.startsWith('.')) return false;
  return REVIEW_FIRST_PARTY_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

function parseHttps(raw) {
  if (typeof raw !== 'string' || raw.length > URL_MAX) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return null;
  return url.hash ? null : url;
}

/** Keep in sync with safeReviewLink in review.ts. */
export function safeReviewLink(raw) {
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const artifact =
    host === REVIEW_ARTIFACT_HOST &&
    REVIEW_ARTIFACT_PATHS.some((prefix) => url.pathname.startsWith(prefix));
  if (!artifact && !firstParty(host)) return null;
  const normalized = url.toString();
  return normalized.length > URL_MAX ? null : normalized;
}

/** Keep in sync with safeReviewImageUrl in review.ts. */
export function safeReviewImageUrl(raw) {
  const url = parseHttps(raw);
  if (!url || url.search || !firstParty(url.hostname.toLowerCase()))
    return null;
  if (!/\.(png|jpe?g|webp)$/i.test(url.pathname)) return null;
  const normalized = url.toString();
  return normalized.length > URL_MAX ? null : normalized;
}

/** Keep in sync with sniffReviewImage in review.ts. */
export function sniffReviewImage(bytes) {
  const starts = (...sig) => sig.every((b, i) => bytes[i] === b);
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

/**
 * The review payload of a decision file, or null when unusable. `preview`
 * is `{ url }` for a first-party hosted image or `{ file }` for an image in
 * the fleet-sync `reviews/` folder (a bare file name); a file preview stays
 * pending until `attachReviewAssets` uploads it. A bad preview is dropped,
 * never a review that has a usable mockup link. Document-only reviews wait
 * for a valid uploaded document before publishing.
 */
export function parseReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mockupUrl = safeReviewLink(raw.mockupUrl);
  const document =
    typeof raw.document?.file === 'string' &&
    DOCUMENT_FILE.test(raw.document.file)
      ? { source: 'file', file: raw.document.file }
      : undefined;
  if (!mockupUrl && !document) return null;
  const result = {
    ...(mockupUrl ? { mockupUrl } : {}),
    ...(document ? { document } : {}),
  };
  const preview = raw.preview;
  if (preview && typeof preview === 'object') {
    const hosted = safeReviewImageUrl(preview.url);
    if (hosted) result.preview = { source: 'hosted', url: hosted };
    else if (
      typeof preview.file === 'string' &&
      PREVIEW_FILE.test(preview.file)
    )
      result.preview = { source: 'file', file: preview.file };
  }
  return result;
}

/**
 * Image bytes from a regular file this user owns, opened without following
 * links or blocking; null past the size cap or for anything else.
 */
export function readReviewImage(file) {
  return readReviewFile(file, REVIEW_IMAGE_MAX_BYTES, sniffReviewImage);
}

export function readReviewDocument(file) {
  return readReviewFile(file, REVIEW_DOCUMENT_MAX_BYTES, sniffReviewDocument);
}

function readReviewFile(file, max, sniff) {
  let fd;
  try {
    fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
      stat.size === 0 ||
      stat.size > max
    )
      return null;
    // Read at most one byte past the cap, so a file that grows after the
    // size check can never stall the run.
    const buffer = Buffer.alloc(max + 1);
    let length = 0;
    for (let read = 1; read > 0 && length < buffer.length; length += read)
      read = fs.readSync(fd, buffer, length, buffer.length - length, null);
    if (length === 0 || length > max) return null;
    const bytes = buffer.subarray(0, length);
    const contentType = sniff(bytes);
    if (!contentType) return null;
    const assetId = createHash('sha256').update(bytes).digest('hex');
    return { bytes, contentType, assetId };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Resolves pending file assets in place: uploads each asset once (then
 * again every few days while the review stays open) and swaps in its asset
 * id. A preview that cannot be read or uploaded is dropped, never the
 * review. `uploaded` maps asset id to its last upload time and is returned
 * pruned to the ids still in use.
 */
export async function attachReviewAssets(
  decisions,
  { dir, put, origin, uploaded = {}, now = new Date() }
) {
  const kept = {};
  let budget = UPLOADS_PER_RUN;
  for (const decision of [...decisions]) {
    for (const field of ['document', 'preview']) {
      const pending = decision.review?.[field];
      if (pending?.source !== 'file') continue;
      delete decision.review[field];
      const asset = (
        field === 'document' ? readReviewDocument : readReviewImage
      )(path.join(dir, pending.file));
      if (!asset) continue;
      const last = Date.parse(uploaded[asset.assetId] ?? '');
      let at = Number.isNaN(last) ? undefined : uploaded[asset.assetId];
      if (!at || now.getTime() - last >= REUPLOAD_MS) {
        if (budget <= 0) continue;
        budget--;
        try {
          await put(
            `${ASSET_PATH}${asset.assetId}`,
            JSON.stringify({
              contentType: asset.contentType,
              data: asset.bytes.toString('base64'),
            })
          );
          at = now.toISOString();
        } catch {
          continue;
        }
      }
      kept[asset.assetId] = at;
      decision.review[field] = {
        source: 'asset',
        assetId: asset.assetId,
        contentType: asset.contentType,
      };
      if (field === 'document' && !decision.review.mockupUrl)
        decision.review.mockupUrl = safeReviewLink(
          `${origin}${ASSET_PATH}${asset.assetId}`
        );
    }
    if (decision.review && !decision.review.mockupUrl)
      decisions.splice(decisions.indexOf(decision), 1);
  }
  return kept;
}

export function sniffReviewDocument(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /^(?:<!doctype html|<html)/i.test(
      text.replace(/^\uFEFF/, '').trimStart()
    )
      ? 'text/html'
      : null;
  } catch {
    return null;
  }
}
