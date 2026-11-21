import { createHash } from 'node:crypto';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { z } from 'zod';
import {
  FLEET_REVIEW_ASSET_ID,
  FLEET_REVIEW_IMAGE_MAX_BYTES,
  FLEET_REVIEW_IMAGE_TYPES,
  type FleetReviewImageType,
  sniffReviewImage,
} from './review';

const ASSET_PREFIX = 'mastermind:fleet:v1:review-asset:';
/** A review stays open for days at most; its preview outlives it a little. */
export const FLEET_REVIEW_ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** JSON envelope around the base64 image, under the store's value cap. */
export const FLEET_REVIEW_UPLOAD_MAX_BYTES =
  Math.ceil((FLEET_REVIEW_IMAGE_MAX_BYTES * 4) / 3) + 1024;

const uploadSchema = z.object({
  contentType: z.enum(FLEET_REVIEW_IMAGE_TYPES),
  data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),
});

export interface FleetReviewAsset {
  contentType: FleetReviewImageType;
  bytes: Uint8Array;
}

export type ReviewUploadError =
  | 'invalid_asset'
  | 'asset_too_large'
  | 'asset_type_mismatch'
  | 'asset_id_mismatch';

/**
 * Checks an upload: declared type allowed, at most the byte cap, the bytes'
 * own signature matching the declared type, and the id equal to their
 * sha256, so an id always names exactly one image.
 */
export function parseReviewUpload(
  assetId: string,
  body: unknown
):
  | { ok: true; asset: FleetReviewAsset }
  | { ok: false; error: ReviewUploadError } {
  if (!FLEET_REVIEW_ASSET_ID.test(assetId))
    return { ok: false, error: 'invalid_asset' };
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'invalid_asset' };
  const bytes = new Uint8Array(Buffer.from(parsed.data.data, 'base64'));
  if (bytes.byteLength === 0) return { ok: false, error: 'invalid_asset' };
  if (bytes.byteLength > FLEET_REVIEW_IMAGE_MAX_BYTES)
    return { ok: false, error: 'asset_too_large' };
  if (sniffReviewImage(bytes) !== parsed.data.contentType)
    return { ok: false, error: 'asset_type_mismatch' };
  if (createHash('sha256').update(bytes).digest('hex') !== assetId)
    return { ok: false, error: 'asset_id_mismatch' };
  return {
    ok: true,
    asset: { contentType: parsed.data.contentType, bytes },
  };
}

const INDEX_KEY = 'mastermind:fleet:v1:review-assets';
/**
 * Live previews at most: the store holds a bounded number of rows, and the
 * signed fleet calls need room for their nonces, so assets never fill it.
 */
export const FLEET_REVIEW_ASSET_MAX_LIVE = 24;
const CAS_ATTEMPTS = 3;

export class ReviewAssetLimitError extends Error {
  constructor() {
    super('review asset limit');
  }
}

interface IndexEntry {
  id: string;
  exp: number;
}

function parseIndex(raw: string | null, now: number): IndexEntry[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is IndexEntry =>
            typeof entry?.id === 'string' &&
            typeof entry?.exp === 'number' &&
            entry.exp > now
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Stores or renews an asset. A small index row, updated by compare-and-set,
 * counts live assets: a new id past FLEET_REVIEW_ASSET_MAX_LIVE is refused
 * with ReviewAssetLimitError, and a repeat upload of a live id renews its
 * expiry (the bytes are the same, since the id is their hash).
 */
export async function writeReviewAsset(
  store: MastermindStore,
  assetId: string,
  asset: FleetReviewAsset,
  now = Date.now()
) {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const raw = await store.get(INDEX_KEY);
    const live = parseIndex(raw, now).filter((entry) => entry.id !== assetId);
    if (live.length >= FLEET_REVIEW_ASSET_MAX_LIVE)
      throw new ReviewAssetLimitError();
    const next = [
      ...live,
      { id: assetId, exp: now + FLEET_REVIEW_ASSET_TTL_MS },
    ];
    if (
      !(await store.compareAndSet(
        INDEX_KEY,
        raw ?? null,
        JSON.stringify(next),
        FLEET_REVIEW_ASSET_TTL_MS
      ))
    )
      continue;
    await store.set(
      `${ASSET_PREFIX}${assetId}`,
      JSON.stringify({
        contentType: asset.contentType,
        data: Buffer.from(asset.bytes).toString('base64'),
      }),
      { ttlMs: FLEET_REVIEW_ASSET_TTL_MS }
    );
    return;
  }
  throw new Error('review asset contention');
}

/** The stored asset, re-checked on the way out, or null. */
export async function readReviewAsset(
  store: MastermindStore,
  assetId: string
): Promise<FleetReviewAsset | null> {
  if (!FLEET_REVIEW_ASSET_ID.test(assetId)) return null;
  const raw = await store.get(`${ASSET_PREFIX}${assetId}`);
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parseReviewUpload(assetId, json);
  return parsed.ok ? parsed.asset : null;
}
