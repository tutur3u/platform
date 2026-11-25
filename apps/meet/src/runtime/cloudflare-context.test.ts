import { beforeEach, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  current: {} as { cloudflare?: { env: unknown; ctx: unknown } },
}));
vi.mock('./request-context', () => ({ meetRequest: () => request.current }));

import { getCloudflareContext } from './cloudflare-context';

const bindings = { env: { MEET_AI_DISABLED: 'false' }, ctx: {} };

beforeEach(() => {
  request.current = { cloudflare: bindings };
});

it('returns a Promise for async callers, as @opennextjs/cloudflare does', async () => {
  const pending = getCloudflareContext({ async: true });
  expect(pending).toBeInstanceOf(Promise);
  // Private Mira chains `.catch` on it; a bare object made that a TypeError.
  await expect(pending.catch(() => null)).resolves.toBe(bindings);
});

it('rejects an async read without bindings instead of throwing', async () => {
  request.current = {};
  let pending: Promise<unknown> | undefined;
  expect(() => {
    pending = getCloudflareContext({ async: true });
  }).not.toThrow();
  await expect(pending).rejects.toThrow(
    'Meet Cloudflare bindings are unavailable'
  );
});

it('keeps the synchronous form for callers without async', () => {
  expect(getCloudflareContext()).toBe(bindings);
  request.current = {};
  expect(() => getCloudflareContext()).toThrow(
    'Meet Cloudflare bindings are unavailable'
  );
});
