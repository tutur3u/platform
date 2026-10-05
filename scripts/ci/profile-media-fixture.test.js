import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { syntheticProfileImage } from '../../apps/web/e2e/helpers/profile-media-fixture.ts';

test('profile upload fixture decodes before optimizing to WebP', async () => {
  const image = syntheticProfileImage();
  const decoded = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 1);
  assert.equal(decoded.info.height, 1);
  assert.ok(decoded.data.length > 0);
  const optimized = await sharp(image).webp({ quality: 85 }).toBuffer();
  assert.equal((await sharp(optimized).metadata()).format, 'webp');
  assert.ok(optimized.length <= 2_000_000);
});

test('a corrupted PNG checksum fails pixel decoding before upload', async () => {
  const corrupt = Buffer.from(syntheticProfileImage());
  corrupt[55] ^= 1; // IDAT checksum: metadata alone does not validate image pixels.
  await assert.rejects(sharp(corrupt).raw().toBuffer(), /libpng read error/);
});
