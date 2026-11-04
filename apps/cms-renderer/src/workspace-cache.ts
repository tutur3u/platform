import { z } from 'zod';

type Scope = { origin: string; site: string; workspaceId: string };
function epochRequest({ origin, site, workspaceId }: Scope) {
  const key = new URL('/__cms/cache-epoch', origin);
  key.search = new URLSearchParams({ site, workspaceId }).toString();
  return new Request(key);
}

export async function rotateWorkspaceCache(
  scope: Scope,
  cache: Pick<Cache, 'put'>
) {
  const epoch = crypto.randomUUID();
  await cache.put(
    epochRequest(scope),
    new Response(epoch, {
      headers: { 'Cache-Control': 'public, max-age=31536000' },
    })
  );
  return epoch;
}

export async function workspaceCacheEpoch(
  scope: Scope,
  cache: Pick<Cache, 'match' | 'put'>
) {
  const cached = await cache.match(epochRequest(scope));
  if (cached) {
    const parsed = z.uuid().safeParse(await cached.text());
    if (parsed.success) return parsed.data;
  }
  // A fresh random namespace on eviction cannot resurrect a previous namespace.
  return rotateWorkspaceCache(scope, cache);
}
