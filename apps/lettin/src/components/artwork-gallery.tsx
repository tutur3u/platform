import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { galleryImage } from './gallery-model';

export function ArtworkGallery({ items }: { items?: LettinArtwork[] }) {
  const t = useTranslations('lettin');
  if (!items?.length) return null;
  return (
    <section
      aria-label={t('artworkGallery')}
      className="my-8 grid gap-6 sm:grid-cols-2"
    >
      {items.slice(0, 12).map((item, index) => {
        const image = galleryImage(item.image);
        if (!image) return null;
        return (
          <figure key={`${index}-${item.image}`} className="min-w-0">
            {/* biome-ignore lint/performance/noImgElement: Artwork access must remain revocable without optimizer caching. */}
            <img
              src={image}
              alt={item.alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="max-h-96 w-full rounded-lg object-contain"
            />
            {(item.caption || item.credit) && (
              <figcaption className="mt-2 space-y-1 break-words text-sm">
                {item.caption && <p>{item.caption}</p>}
                {item.credit && (
                  <p className="text-muted-foreground">
                    {t('artworkCredit', { credit: item.credit })}
                  </p>
                )}
              </figcaption>
            )}
          </figure>
        );
      })}
    </section>
  );
}
