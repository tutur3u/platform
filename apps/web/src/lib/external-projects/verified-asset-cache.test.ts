import { expect, it, vi } from 'vitest';
import { cachedVerifiedAsset } from './verified-asset-cache';

vi.mock('server-only', () => ({}));

it('serves loads past the in-flight bound without caching them', async () => {
  const releases: Array<() => void> = [];
  const object = { buffer: Buffer.from('bytes'), contentType: 'image/png' };
  const blocked = Array.from({ length: 12 }, (_, i) =>
    cachedVerifiedAsset(
      `blocked-${i}`,
      () => new Promise((resolve) => releases.push(() => resolve(object)))
    )
  );
  let loads = 0;
  const load = async () => {
    loads++;
    return object;
  };
  expect(await cachedVerifiedAsset('overflow', load)).toBe(object);
  for (const release of releases) release();
  await Promise.all(blocked);
  expect(await cachedVerifiedAsset('overflow', load)).toBe(object);
  expect(await cachedVerifiedAsset('overflow', load)).toBe(object);
  expect(loads).toBe(2);
});
