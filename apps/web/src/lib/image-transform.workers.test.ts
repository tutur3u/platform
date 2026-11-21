import { describe, expect, it, vi } from 'vitest';
import {
  createImagesTransformer,
  type ImagesBinding,
} from './image-transform.workers';

function binding(info: { format: string; width?: number; height?: number }) {
  const transform = vi.fn();
  const output = vi.fn(async () => ({
    response: () => new Response(new Uint8Array([1, 2, 3])),
  }));
  const handle = { transform, output };
  transform.mockReturnValue(handle);
  const images: ImagesBinding = {
    info: vi.fn(async () => info),
    input: vi.fn(() => handle),
  };
  return { images, transform, output };
}

const options = { limitInputPixels: 1000, failOn: 'warning' as const };

describe('Cloudflare Images transformer', () => {
  it('reports the sharp format name for the input', async () => {
    const { images } = binding({ format: 'image/jpeg', width: 10, height: 10 });
    const image = createImagesTransformer(images).decode(
      Buffer.from('x'),
      options
    );
    expect(await image.metadata()).toEqual({ format: 'jpeg' });
  });

  it('renders one still, metadata-free WebP inside the box', async () => {
    const { images, transform, output } = binding({
      format: 'image/png',
      width: 20,
      height: 20,
    });
    const image = createImagesTransformer(images).decode(
      Buffer.from('x'),
      options
    );
    const bytes = await image.webp({
      width: 8,
      height: 6,
      quality: 72,
      effort: 4,
    });
    expect(bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(transform).toHaveBeenCalledWith({
      width: 8,
      height: 6,
      fit: 'scale-down',
      metadata: 'none',
    });
    expect(output).toHaveBeenCalledWith({
      format: 'image/webp',
      quality: 72,
      anim: false,
    });
  });

  it('rejects inputs over the pixel limit before transforming', async () => {
    const { images, output } = binding({
      format: 'image/png',
      width: 100,
      height: 100,
    });
    const image = createImagesTransformer(images).decode(
      Buffer.from('x'),
      options
    );
    await expect(image.metadata()).rejects.toThrow('pixel limit');
    await expect(
      image.webp({ width: 8, height: 8, quality: 80, effort: 4 })
    ).rejects.toThrow('pixel limit');
    expect(output).not.toHaveBeenCalled();
    expect(images.info).toHaveBeenCalledOnce();
  });
});
