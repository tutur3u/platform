import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  env: { WEB_APP: 'test' },
  waitUntil: vi.fn(),
}));
vi.mock('cloudflare:workers', () => runtime);

import { getCloudflareContext } from './cloudflare-context';

it('returns a Promise for async callers, as @opennextjs/cloudflare does', async () => {
  const pending = getCloudflareContext({ async: true });
  expect(pending).toBeInstanceOf(Promise);
  const context = await pending.catch(() => null);
  expect(context?.env).toBe(runtime.env);
  expect(context?.ctx).toEqual({ waitUntil: runtime.waitUntil });
});

it('keeps the synchronous form for callers without async', () => {
  const context = getCloudflareContext();
  expect(context).not.toBeInstanceOf(Promise);
  expect(context.env).toBe(runtime.env);
});
