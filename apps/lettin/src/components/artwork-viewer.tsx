'use client';
import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { galleryImage } from './gallery-model';

export function ArtworkViewer({
  item,
  number,
}: {
  item: LettinArtwork;
  number: number;
}) {
  const t = useTranslations('lettin');
  const image = galleryImage(item.image);
  if (!image) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('viewArtwork', { number })}
          className="block w-full rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
        >
          {/* biome-ignore lint/performance/noImgElement: Artwork access must remain revocable without optimizer caching. */}
          <img
            src={image}
            alt={item.alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-96 w-full rounded-lg object-contain"
          />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl"
      >
        <DialogHeader>
          <DialogTitle>{t('artworkViewerTitle', { number })}</DialogTitle>
          <DialogDescription>{t('artworkViewerHint')}</DialogDescription>
        </DialogHeader>
        <figure className="min-w-0">
          {/* biome-ignore lint/performance/noImgElement: The original media endpoint must recheck access on every request. */}
          <img
            src={image}
            alt={item.alt}
            referrerPolicy="no-referrer"
            className="max-h-[65dvh] w-full object-contain"
          />
          {(item.caption || item.credit) && (
            <figcaption className="mt-3 space-y-1 break-words text-sm">
              {item.caption && <p>{item.caption}</p>}
              {item.credit && (
                <p className="text-muted-foreground">
                  {t('artworkCredit', { credit: item.credit })}
                </p>
              )}
            </figcaption>
          )}
        </figure>
        <DialogClose asChild>
          <button
            type="button"
            className="justify-self-end rounded border border-input px-4 py-2 text-sm"
          >
            {t('closeArtwork')}
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
