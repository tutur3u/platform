import { z } from 'zod';
import { safeImage } from './rich-text-schema';

export const artworkImageSchema = z.union([
  z.literal(''),
  z.string().regex(/^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/),
  z
    .url()
    .max(2000)
    .refine((v) => v.startsWith('https://') && safeImage(v))
    .transform((value) => {
      const url = new URL(value);
      return url.origin === 'https://lettin.tuturuuu.com' &&
        /^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(url.pathname)
        ? url.pathname
        : value;
    }),
]);

export const artworkGallerySchema = z
  .array(
    z.object({
      image: z
        .string()
        .refine((value) => {
          if (/^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(value))
            return true;
          try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password;
          } catch {
            return false;
          }
        })
        .pipe(artworkImageSchema),
      alt: z.string().trim().min(1).max(500),
      caption: z.string().max(1000),
      credit: z.string().max(200),
    })
  )
  .max(12);
