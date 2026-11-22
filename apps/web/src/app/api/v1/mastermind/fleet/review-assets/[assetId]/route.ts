import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
  logFleetStoreFailure,
} from '@/lib/mastermind/fleet/http';
import { FLEET_REVIEW_ASSET_ID } from '@/lib/mastermind/fleet/review';
import {
  FLEET_REVIEW_UPLOAD_MAX_BYTES,
  parseReviewUpload,
  ReviewAssetLimitError,
  readReviewAsset,
  writeReviewAsset,
} from '@/lib/mastermind/fleet/review-assets';

/**
 * Design-review images and HTML attachments. The orchestrator publisher uploads one
 * (HMAC-signed, size-capped, type-sniffed, content-addressed); only the
 * fleet owner reads it back. HTML is always an inert download: no sniffing, no
 * scripts, never cached by shared caches.
 */
export const GET = withSessionAuth<{ assetId: string }>(
  async (_request, { user }, { assetId }) => {
    if (!FLEET_REVIEW_ASSET_ID.test(assetId))
      return fleetError('not_found', 404);
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);
    let asset: Awaited<ReturnType<typeof readReviewAsset>>;
    try {
      asset = await readReviewAsset(store, assetId);
    } catch (error) {
      logFleetStoreFailure(error);
      return fleetError('unavailable', 503);
    }
    if (!asset) return fleetError('not_found', 404);
    return new NextResponse(Buffer.from(asset.bytes), {
      headers: {
        'content-type':
          asset.contentType === 'text/html'
            ? 'application/octet-stream'
            : asset.contentType,
        'content-length': String(asset.bytes.byteLength),
        // Content-addressed: the id never names other bytes.
        'cache-control':
          asset.contentType === 'text/html'
            ? 'private, no-store'
            : 'private, max-age=86400, immutable',
        'content-security-policy': "default-src 'none'; sandbox",
        'content-disposition':
          asset.contentType === 'text/html' ? 'attachment' : 'inline',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-site',
      },
    });
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 120 },
    allowAppSessionAuth: MASTERMIND_APP_SESSION,
  }
);

/** Publisher upload: `{ contentType, data }` with base64 asset bytes. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  if (!FLEET_REVIEW_ASSET_ID.test(assetId)) return fleetError('not_found', 404);
  const auth = await authorizeFleetPublisher(
    request,
    FLEET_REVIEW_UPLOAD_MAX_BYTES
  );
  if (!auth.ok) return auth.response;
  let json: unknown;
  try {
    json = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = parseReviewUpload(assetId, json);
  if (!parsed.ok)
    return fleetError(
      parsed.error,
      parsed.error === 'asset_too_large' ? 413 : 422
    );
  try {
    await writeReviewAsset(auth.store, assetId, parsed.asset);
  } catch (error) {
    if (error instanceof ReviewAssetLimitError)
      return fleetError('asset_limit', 429);
    logFleetStoreFailure(error);
    return fleetError('unavailable', 503);
  }
  return NextResponse.json(
    { accepted: true, assetId },
    { status: 201, headers: FLEET_NO_STORE }
  );
}
