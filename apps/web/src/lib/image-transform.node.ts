import sharp from 'sharp';
import type { ImageTransformer } from './image-transform';

export const sharpImageTransformer: ImageTransformer = {
  decode(input, options) {
    const image = sharp(input, options);
    return {
      metadata: () => image.metadata(),
      webp: ({ width, height, quality, effort }) =>
        image
          .clone()
          .rotate()
          .resize({ width, height, fit: 'inside', withoutEnlargement: true })
          .webp({ quality, effort })
          .timeout({ seconds: 3 })
          .toBuffer(),
      destroy: () => image.destroy(),
    };
  },
};
