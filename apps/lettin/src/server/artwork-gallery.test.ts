import { expect, it } from 'vitest';
import { galleryImage, validGallery } from '../components/gallery-model';
import { artworkGallerySchema } from './artwork-schema';
import { lettinDraftSchema } from './schema';

const item = {
  image: 'https://images.example.test/art.png',
  alt: 'Portrait',
  caption: 'A pilot',
  credit: 'Artist',
};
it('accepts ordered gallery metadata and canonicalizes managed image URLs', () => {
  const id = crypto.randomUUID();
  const parsed = artworkGallerySchema.parse([
    item,
    {
      ...item,
      image: `https://lettin.tuturuuu.com/api/v1/lettin/media/${id}`,
      alt: '  Landscape  ',
    },
  ]);
  expect(parsed[0]).toEqual(item);
  expect(parsed[1]).toMatchObject({
    image: `/api/v1/lettin/media/${id}`,
    alt: 'Landscape',
  });
  expect(validGallery(parsed)).toBe(true);
});
it.each([
  '',
  'javascript:alert(1)',
  'data:image/png;base64,abc',
  'http://example.test/x',
  'not a URL',
  'https://user:password@example.test/x',
])('rejects unsafe gallery image %s', (image) => {
  expect(artworkGallerySchema.safeParse([{ ...item, image }]).success).toBe(
    false
  );
  expect(galleryImage(image)).toBeUndefined();
});
it('bounds counts and metadata and requires alt text', () => {
  for (const items of [
    Array(13).fill(item),
    [{ ...item, alt: ' ' }],
    [{ ...item, alt: 'x'.repeat(501) }],
    [{ ...item, caption: 'x'.repeat(1001) }],
    [{ ...item, credit: 'x'.repeat(201) }],
  ]) {
    expect(artworkGallerySchema.safeParse(items).success).toBe(false);
    expect(validGallery(items)).toBe(false);
  }
  expect(artworkGallerySchema.safeParse(Array(12).fill(item)).success).toBe(
    true
  );
});
it('keeps legacy drafts without galleries compatible', () => {
  const draft = {
    title: 'Legacy',
    description: '',
    image: '',
    credit: '',
    kind: 'page',
    tags: [],
    links: [],
    content: { type: 'doc' },
  };
  expect(lettinDraftSchema.parse(draft)).not.toHaveProperty('gallery');
  expect(validGallery()).toBe(true);
});
