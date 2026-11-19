import type { MediaPreviewItem } from '@tuturuuu/ui/custom/media-preview-dialog';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import type { Locale, StoreShot } from '../../content/store-releases';
import { fill } from '../insights/format';
import type { Lang, Messages } from '../shared';
import type { Store } from './store-data';

// The dialog (and the image viewer behind it) loads on the first open.
const Preview = lazy(() =>
  import('@tuturuuu/ui/custom/media-preview-dialog').then((m) => ({
    default: m.MediaPreviewDialog,
  }))
);

/** A thumbnail with a skeleton until the image has decoded. */
function Thumb({ shot, lang }: { shot: StoreShot; lang: Lang }) {
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // An image can finish before hydration, so its load event is already gone.
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth) setLoaded(true);
  }, []);
  return (
    <span
      className="relative block h-48 overflow-hidden rounded-lg border bg-muted sm:h-56"
      style={{ aspectRatio: shot.width / shot.height }}
    >
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        ref={image}
        src={shot.url}
        alt={shot.alt[lang]}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className="size-full object-cover object-top transition-opacity duration-200 motion-reduce:transition-none"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  );
}

/**
 * One store's screenshots as a strip of equal-height thumbnails. A thumbnail
 * opens the preview dialog on that screenshot, with the store, device and
 * language of the capture as its caption.
 */
export function StoreGallery({
  store,
  lang,
  t,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
}) {
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const device =
    (t.devices as Record<string, string>)[store.device] ?? store.device;
  const language = t.locales[store.locale as Locale];
  const items: MediaPreviewItem[] = store.shots.map((shot) => ({
    src: shot.url,
    alt: shot.alt[lang],
    width: shot.width,
    height: shot.height,
    title: shot.caption[lang],
    details: [store.name, device, language],
  }));
  if (!store.shots.length) return null;

  return (
    <>
      <ul
        aria-label={t.screenshots}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
      >
        {store.shots.map((shot, position) => (
          <li key={shot.id} className="shrink-0 snap-start">
            <button
              type="button"
              aria-label={fill(t.open, { title: shot.caption[lang] })}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setIndex(position);
                setOpened(true);
                setOpen(true);
              }}
              className="block rounded-lg outline-ring/50 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Thumb shot={shot} lang={lang} />
            </button>
          </li>
        ))}
      </ul>
      {opened && (
        <Suspense fallback={null}>
          <Preview
            open={open}
            onOpenChange={setOpen}
            items={items}
            index={index}
            onIndexChange={setIndex}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            labels={{
              ...t.preview,
              counter: (n, total) => fill(t.preview.counter, { n, total }),
            }}
          />
        </Suspense>
      )}
    </>
  );
}
