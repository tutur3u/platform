import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const input = fileURLToPath(
  new URL('../public/media/privacy/product-tour.jpg', import.meta.url)
);
for (const width of [480, 960, 1280]) {
  await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(
      fileURLToPath(
        new URL(
          `../src/components/landing/hero/product-tour-${width}.webp`,
          import.meta.url
        )
      )
    );
}
