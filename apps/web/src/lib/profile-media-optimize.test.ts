// @vitest-environment node
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  optimizeProfileMedia,
  PROFILE_MEDIA_OUTPUT_BYTES,
} from './profile-media-optimize';

it.each(['avatar', 'banner'] as const)(
  'compresses a noisy %s above the final cap into valid bounded WebP',
  async (kind) => {
    const width = kind === 'avatar' ? 800 : 1600;
    const height = kind === 'avatar' ? 800 : 1000;
    const source = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(source.length).toBeGreaterThan(PROFILE_MEDIA_OUTPUT_BYTES[kind]);
    const output = await optimizeProfileMedia(source, kind);
    expect(output.length).toBeLessThanOrEqual(PROFILE_MEDIA_OUTPUT_BYTES[kind]);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(kind === 'avatar' ? 1024 : 2560);
    expect(metadata.height).toBeLessThanOrEqual(
      kind === 'avatar' ? 1024 : 1440
    );
    expect(metadata.exif).toBeUndefined();
  }
);
it('orients pixels, preserves transparency, strips private metadata and never enlarges', async () => {
  const source = await sharp({
    create: {
      width: 32,
      height: 16,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const output = await optimizeProfileMedia(source, 'avatar');
  expect(await sharp(output).metadata()).toMatchObject({
    width: 16,
    height: 32,
    hasAlpha: true,
  });
  expect((await sharp(output).metadata()).exif).toBeUndefined();
});
it('reduces huge dimensions within the safe pixel budget', async () => {
  const source = await sharp({
    create: { width: 6000, height: 1000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  expect(
    (await sharp(await optimizeProfileMedia(source, 'banner')).metadata()).width
  ).toBe(2560);
});
it.each([
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  Buffer.from('not an image'),
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
])('rejects unsupported or corrupt bytes', async (source) => {
  await expect(optimizeProfileMedia(source, 'avatar')).rejects.toMatchObject({
    status: 400,
  });
});
it('rejects decompression-sized images before processing pixels', async () => {
  const source = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await expect(optimizeProfileMedia(source, 'banner')).rejects.toMatchObject({
    status: 400,
  });
});
