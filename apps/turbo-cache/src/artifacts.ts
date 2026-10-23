import type { CacheConfig, R2BucketLike, TokenEntry } from './config';

// Turborepo remote cache artifact operations (API v8) over R2.
//
// Keys are `v1/<scope>/<hash>`. Scopes come from the server-side token
// registry, never from the client's `teamId`/`slug` query, so a branch
// writer can never place an artifact where a main reader looks.

export const HASH = /^[a-f0-9]{16,64}$/;
const DURATION = /^\d{1,10}$/;
const TAG = /^[A-Za-z0-9+/=_-]{1,512}$/;
export const MAX_BATCH_HASHES = 50;

export function artifactKey(scope: string, hash: string) {
  return `v1/${scope}/${hash}`;
}

function isFresh(uploaded: Date, config: CacheConfig, now: Date) {
  // R2 lifecycle expiry is the storage bound; this check keeps a missing or
  // delayed lifecycle rule from serving artifacts past the documented TTL.
  return now.getTime() - uploaded.getTime() <= config.ttlMs;
}

function artifactHeaders(metadata: Record<string, string> | undefined) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/octet-stream',
  });
  if (metadata?.tag) headers.set('x-artifact-tag', metadata.tag);
  if (metadata?.duration) headers.set('x-artifact-duration', metadata.duration);
  return headers;
}

export async function readArtifact(
  bucket: R2BucketLike,
  token: TokenEntry,
  hash: string,
  config: CacheConfig,
  now: Date,
  method: 'GET' | 'HEAD'
) {
  for (const scope of token.read) {
    const key = artifactKey(scope, hash);
    if (method === 'HEAD') {
      const object = await bucket.head(key);
      if (object && isFresh(object.uploaded, config, now)) {
        const headers = artifactHeaders(object.customMetadata);
        headers.set('Content-Length', String(object.size));
        return new Response(null, { status: 200, headers });
      }
      continue;
    }
    const object = await bucket.get(key);
    if (!object) continue;
    if (!isFresh(object.uploaded, config, now)) {
      await object.body.cancel();
      continue;
    }
    const headers = artifactHeaders(object.customMetadata);
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  }
  return null;
}

export interface UploadCheck {
  ok: true;
  length: number;
  tag: string;
  duration: string;
}

export interface UploadRejection {
  ok: false;
  status: number;
  error: string;
}

export function checkUpload(
  request: Request,
  config: CacheConfig
): UploadCheck | UploadRejection {
  const rawLength = request.headers.get('content-length');
  if (!rawLength || !/^\d{1,12}$/.test(rawLength))
    return { ok: false, status: 411, error: 'length_required' };
  const length = Number(rawLength);
  if (length < 1) return { ok: false, status: 400, error: 'empty_artifact' };
  if (length > config.maxArtifactBytes)
    return { ok: false, status: 413, error: 'artifact_too_large' };
  const tag = request.headers.get('x-artifact-tag') ?? '';
  if (tag && !TAG.test(tag))
    return { ok: false, status: 400, error: 'invalid_tag' };
  if (config.requireSignature && !tag)
    return { ok: false, status: 400, error: 'signature_required' };
  const duration = request.headers.get('x-artifact-duration') ?? '0';
  if (!DURATION.test(duration))
    return { ok: false, status: 400, error: 'invalid_duration' };
  return { ok: true, length, tag, duration };
}

export async function writeArtifact(
  bucket: R2BucketLike,
  token: TokenEntry & { write: string },
  hash: string,
  request: Request,
  upload: UploadCheck
) {
  if (!request.body) return false;
  const metadata: Record<string, string> = {
    duration: upload.duration,
    writer: token.id,
  };
  if (upload.tag) metadata.tag = upload.tag;
  const stored = await bucket.put(
    artifactKey(token.write, hash),
    request.body,
    {
      customMetadata: metadata,
      httpMetadata: { contentType: 'application/octet-stream' },
    }
  );
  return stored !== null;
}

export async function queryArtifacts(
  bucket: R2BucketLike,
  token: TokenEntry,
  hashes: string[],
  config: CacheConfig,
  now: Date
) {
  const result: Record<
    string,
    { size: number; taskDurationMs: number; tag?: string } | null
  > = {};
  for (const hash of hashes) {
    result[hash] = null;
    for (const scope of token.read) {
      const object = await bucket.head(artifactKey(scope, hash));
      if (!object || !isFresh(object.uploaded, config, now)) continue;
      result[hash] = {
        size: object.size,
        taskDurationMs: Number(object.customMetadata?.duration ?? 0),
        tag: object.customMetadata?.tag,
      };
      break;
    }
  }
  return result;
}
