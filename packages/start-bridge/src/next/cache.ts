import { bridgeRequest } from '../server/request-context';

export function revalidatePath(_path: string, _type?: 'page' | 'layout') {
  // Native Start has no persistent Next rendering cache. Every successful
  // transport also invalidates the current native route in the browser.
  bridgeRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}

export function revalidateTag(_tag: string) {
  bridgeRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}

// `'use cache'` profiles and tags: the bridge keeps no persistent data cache,
// so cached functions simply run per request and these record nothing.
export function cacheLife(_profile: string | Record<string, number>) {}

export function cacheTag(..._tags: string[]) {}

export function unstable_cache<Args extends unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  _keyParts?: string[],
  _options?: { revalidate?: number | false; tags?: string[] }
) {
  return callback;
}
