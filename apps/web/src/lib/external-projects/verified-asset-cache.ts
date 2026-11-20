import {
  assetBytesDigest,
  readExternalProjectAssetBytes,
} from './asset-publication-bytes';

type Bytes = { buffer: Buffer; contentType: string | null };
const maxCacheBytes = 48 * 1024 * 1024;
const ttlMs = 120_000;
const cache = new Map<string, { object: Bytes; expires: number }>();
const pending = new Map<string, Promise<Bytes | null>>();
let bytes = 0;

function forget(key: string, size: number) {
  cache.delete(key);
  bytes -= size;
}

export async function cachedVerifiedAsset(
  key: string,
  load: () => Promise<Bytes | null>
) {
  const existing = cache.get(key);
  if (existing) {
    forget(key, existing.object.buffer.byteLength);
    if (existing.expires > Date.now()) {
      cache.set(key, existing);
      bytes += existing.object.buffer.byteLength;
      return existing.object;
    }
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  // Past the shared-load bound, serve the request without caching its bytes.
  if (pending.size >= 12) return load();

  const request = load()
    .then((object) => {
      if (!object || object.buffer.byteLength > maxCacheBytes) return object;
      while (
        bytes + object.buffer.byteLength > maxCacheBytes ||
        cache.size >= 512
      ) {
        const oldest = cache.entries().next().value;
        if (!oldest) break;
        forget(oldest[0], oldest[1].object.buffer.byteLength);
      }
      cache.set(key, { object, expires: Date.now() + ttlMs });
      bytes += object.buffer.byteLength;
      return object;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function readVerifiedAsset(
  key: string,
  workspaceId: string,
  path: string | null,
  digest: string
) {
  return cachedVerifiedAsset(key, async () => {
    const object = await readExternalProjectAssetBytes(workspaceId, path);
    return object && assetBytesDigest(object.buffer) === digest ? object : null;
  });
}
