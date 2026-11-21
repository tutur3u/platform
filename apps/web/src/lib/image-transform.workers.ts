import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import type { DecodedImage, ImageTransformer } from './image-transform';

/** The subset of the Workers Images binding this adapter uses. */
export interface ImagesBinding {
  info(
    stream: ReadableStream<Uint8Array>
  ): Promise<{ format: string; width?: number; height?: number }>;
  input(stream: ReadableStream<Uint8Array>): ImagesHandle;
}

interface ImagesHandle {
  transform(options: Record<string, unknown>): ImagesHandle;
  output(options: {
    format: 'image/webp';
    quality: number;
    anim: boolean;
  }): Promise<{ response(): Response }>;
}

const formats: Record<string, string> = {
  'image/avif': 'heif',
  'image/gif': 'gif',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function streamOf(input: Buffer) {
  return new Blob([new Uint8Array(input)]).stream();
}

/**
 * Cloudflare Images implementation of the sharp contract: rejects inputs over
 * the pixel limit, applies EXIF orientation, fits inside the box without
 * enlarging, strips metadata and always emits a single still WebP frame.
 */
export function createImagesTransformer(
  images: ImagesBinding
): ImageTransformer {
  return {
    decode(input, { limitInputPixels }): DecodedImage {
      let info: ReturnType<ImagesBinding['info']> | null = null;
      const inspect = () => {
        info ??= images.info(streamOf(input)).then((details) => {
          const pixels = (details.width ?? 0) * (details.height ?? 0);
          if (pixels > limitInputPixels) {
            throw new Error('Input image exceeds the pixel limit');
          }
          return details;
        });
        return info;
      };
      return {
        async metadata() {
          const details = await inspect();
          // Animation frames are not reported; output is always one frame.
          return { format: formats[details.format] };
        },
        async webp({ width, height, quality }) {
          await inspect();
          const result = await images
            .input(streamOf(input))
            .transform({ width, height, fit: 'scale-down', metadata: 'none' })
            .output({ format: 'image/webp', quality, anim: false });
          return Buffer.from(await result.response().arrayBuffer());
        },
        destroy() {},
      };
    },
  };
}

/** The Worker's IMAGES binding as a transformer, or null when it is unbound. */
export async function workerImageTransformer(): Promise<ImageTransformer | null> {
  let images: ImagesBinding | undefined;
  try {
    images = getCloudflareContext<{ IMAGES?: ImagesBinding }>().env.IMAGES;
  } catch {
    return null;
  }
  return images ? createImagesTransformer(images) : null;
}
