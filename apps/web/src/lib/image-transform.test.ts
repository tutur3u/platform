import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getImageTransformer, type ImageTransformer } from './image-transform';
import { normalizeFeedbackMedia } from './product-feedback-input';
import { optimizeProfileMedia } from './profile-media-optimize';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function fixture(format = 'png') {
  const image = {
    metadata: vi.fn(async () => ({ format, pages: 1 })),
    webp: vi.fn(async () => Buffer.from('fixture transformed bytes')),
    destroy: vi.fn(),
  };
  const transformer: ImageTransformer = { decode: vi.fn(() => image) };
  return { image, transformer };
}
afterEach(() => vi.unstubAllGlobals());

describe('image runtime boundary', () => {
  it('requires an explicit Worker adapter rather than loading sharp', async () => {
    vi.stubGlobal('WebSocketPair', class {});
    await expect(getImageTransformer()).rejects.toThrow('not configured');
    const { transformer } = fixture();
    expect(await getImageTransformer(transformer)).toBe(transformer);
  });

  it('preserves profile decoder and rendering bounds through the adapter', async () => {
    vi.stubGlobal('WebSocketPair', class {});
    const { transformer, image } = fixture();
    await optimizeProfileMedia(pngSignature, 'avatar', transformer);
    expect(transformer.decode).toHaveBeenCalledWith(pngSignature, {
      limitInputPixels: 20_000_000,
      failOn: 'warning',
      pages: 1,
    });
    expect(image.webp).toHaveBeenCalledWith({
      width: 1024,
      height: 1024,
      quality: 85,
      effort: 4,
    });
    expect(image.destroy).toHaveBeenCalledOnce();
  });

  it('preserves feedback format rejection and releases the decoder', async () => {
    const { transformer, image } = fixture('jpeg');
    await expect(
      normalizeFeedbackMedia(
        { contentType: 'image/png', data: pngSignature.toString('base64') },
        transformer
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(image.webp).not.toHaveBeenCalled();
    expect(image.destroy).toHaveBeenCalledOnce();
  });

  it('preserves feedback render bounds and encoded output', async () => {
    const { transformer, image } = fixture();
    expect(
      await normalizeFeedbackMedia(
        { contentType: 'image/png', data: pngSignature.toString('base64') },
        transformer
      )
    ).toBe(Buffer.from('fixture transformed bytes').toString('base64'));
    expect(image.webp).toHaveBeenCalledWith({
      width: 1920,
      height: 1920,
      quality: 75,
      effort: 2,
    });
    expect(image.destroy).toHaveBeenCalledOnce();
  });
});

it('matches the Node profile and feedback pipelines byte for byte', async () => {
  const source = await sharp({
    create: {
      width: 48,
      height: 24,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const profile = await sharp(source, {
    limitInputPixels: 20_000_000,
    failOn: 'warning',
    pages: 1,
  })
    .clone()
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 4 })
    .timeout({ seconds: 3 })
    .toBuffer();
  expect(await optimizeProfileMedia(source, 'avatar')).toEqual(profile);
  const feedback = await sharp(source, {
    limitInputPixels: 10_000_000,
    failOn: 'warning',
  })
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 75, effort: 2 })
    .timeout({ seconds: 3 })
    .toBuffer();
  expect(
    await normalizeFeedbackMedia({
      contentType: 'image/png',
      data: source.toString('base64'),
    })
  ).toBe(feedback.toString('base64'));
});

vi.mock('server-only', () => ({}));
