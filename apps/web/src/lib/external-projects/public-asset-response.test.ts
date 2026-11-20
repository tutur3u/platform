import { expect, it, vi } from 'vitest';
import { allowPublicAssetTransform } from './asset-transform-limit';
import { publicExternalProjectAssetResponse } from './public-asset-response';

vi.mock('server-only', () => ({}));

const { decode } = vi.hoisted(() => ({
  decode: vi.fn(() => ({
    metadata: async () => ({ pages: 1 }),
    webp: async () => Buffer.from('variant'),
    destroy: vi.fn(),
  })),
}));
vi.mock('../image-transform', () => ({
  getImageTransformer: async () => ({ decode }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: (headers: Headers) => headers.get('x-test-ip'),
}));

it('reuses transformed bytes only for the matching verified cache key and dimensions', async () => {
  const object = { buffer: Buffer.from('original'), contentType: 'image/png' };
  const read = (key: string, width: number) =>
    publicExternalProjectAssetResponse(object, { width }, {}, null, key);
  expect(await (await read('test/revision-1/digest-1', 512))?.text()).toBe(
    'variant'
  );
  expect(await (await read('test/revision-1/digest-1', 512))?.text()).toBe(
    'variant'
  );
  expect(decode).toHaveBeenCalledTimes(1);
  await read('test/revision-1/digest-1', 1200);
  await read('test/revision-2/digest-2', 512);
  expect(decode).toHaveBeenCalledTimes(3);
});

it('limits one IP without blocking a second IP', () => {
  const first = new Headers({ 'x-test-ip': '192.0.2.1' });
  for (let attempt = 0; attempt < 60; attempt++)
    expect(allowPublicAssetTransform(first)).toBe(true);
  expect(allowPublicAssetTransform(first)).toBe(false);
  expect(
    allowPublicAssetTransform(new Headers({ 'x-test-ip': '192.0.2.2' }))
  ).toBe(true);
});
