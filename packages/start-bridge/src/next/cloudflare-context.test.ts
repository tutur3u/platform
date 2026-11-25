import { beforeEach, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  current: {} as { cloudflare?: { env: unknown; ctx: unknown } },
}));
vi.mock('../server/request-context', () => ({
  bridgeRequest: () => request.current,
}));

import { getCloudflareContext } from './cloudflare-context';

const bindings = { env: { APP: 'test' }, ctx: {} };

beforeEach(() => {
  request.current = { cloudflare: bindings };
});

it('returns a Promise for async callers, as @opennextjs/cloudflare does', async () => {
  const pending = getCloudflareContext({ async: true });
  expect(pending).toBeInstanceOf(Promise);
  await expect(pending.catch(() => null)).resolves.toBe(bindings);
});

it('reads the bindings in the request scope, before any await', async () => {
  const pending = getCloudflareContext({ async: true });
  // The request scope ends before the Promise is awaited.
  request.current = {};
  await expect(pending).resolves.toBe(bindings);
});

it('rejects an async read without bindings instead of throwing', async () => {
  request.current = {};
  let pending: Promise<unknown> | undefined;
  expect(() => {
    pending = getCloudflareContext({ async: true });
  }).not.toThrow();
  await expect(pending).rejects.toThrow('Cloudflare bindings are unavailable');
});

it('keeps the synchronous form for callers without async', () => {
  expect(getCloudflareContext()).toBe(bindings);
  request.current = {};
  expect(() => getCloudflareContext()).toThrow(
    'Cloudflare bindings are unavailable'
  );
});
