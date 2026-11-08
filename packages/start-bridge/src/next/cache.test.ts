import { describe, expect, it } from 'vitest';
import { withBridgeRequest } from '../server/request-context';
import { cacheLife, cacheTag, revalidateTag, unstable_cache } from './cache';

describe('next/cache shim', () => {
  it('runs cached functions per request and accepts cache profiles', async () => {
    let calls = 0;
    const load = unstable_cache(
      async (id: string) => `${id}:${++calls}`,
      ['k']
    );
    cacheLife('hours');
    cacheTag('products', 'ws');
    expect(await load('a')).toBe('a:1');
    expect(await load('a')).toBe('a:2');
  });

  it('marks a revalidating response uncacheable', async () => {
    const headers = new Headers();
    await withBridgeRequest(
      { request: new Request('https://x.test/'), responseHeaders: headers },
      async () => revalidateTag('products')
    );
    expect(headers.get('cache-control')).toBe('private, no-store');
  });
});
