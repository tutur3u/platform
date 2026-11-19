/**
 * The store releases and their listing screenshots, shaped for the page from
 * the metadata checked in under apps/mobile/store (the build supplies the
 * JSON and the image URLs; nothing here reads a file).
 */
export type Locale = 'en' | 'vi';
export type Localized = Record<Locale, string>;

export type StoreShot = {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: Localized;
  caption: Localized;
};

type GalleryEntry = {
  file: string;
  width: number;
  height: number;
  alt: Localized;
};

export type StoreMetadata = {
  platform: string;
  release: {
    status: string;
    version: string;
    build: string;
    targetSubmitDate: string | null;
    targetLiveDate: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    liveAt: string | null;
  };
  gallery: readonly GalleryEntry[];
  screenshots: Readonly<
    Record<string, readonly { id: string; caption: Localized }[]>
  >;
};

export type StoreManifest = { source: string };

/**
 * The web gallery's images with their captions, device and language. The
 * manifest's source ("ios/iphone-6.9/en") names the capture the images were
 * made from; each image's caption comes from that device's store screenshot
 * entry with the same id (its file is "NN-id.webp").
 */
export function storeShots(
  metadata: StoreMetadata,
  manifest: StoreManifest,
  urls: Readonly<Record<string, string>>,
  resolve: (file: string) => string = (file) => file
) {
  const [, device = '', capture = 'en'] = manifest.source.split('/');
  const captions = new Map(
    (metadata.screenshots[device] ?? []).map((entry) => [
      entry.id,
      entry.caption,
    ])
  );
  const shots: StoreShot[] = [];
  for (const { file, width, height, alt } of metadata.gallery) {
    const url = urls[resolve(file)];
    if (!url) continue;
    const id = file.replace(/^.*\/\d+-/, '').replace(/\.\w+$/, '');
    shots.push({
      id,
      url,
      width,
      height,
      alt,
      caption: captions.get(id) ?? alt,
    });
  }
  return { device, locale: (capture === 'vi' ? 'vi' : 'en') as Locale, shots };
}

/** The earliest target release date that has not happened and is not live. */
export function nextRelease<T extends { release: StoreMetadata['release'] }>(
  stores: readonly T[],
  now: number
): { store: T; at: string } | null {
  let best: { store: T; at: string } | null = null;
  for (const store of stores) {
    const { targetLiveDate, liveAt } = store.release;
    if (liveAt || !targetLiveDate) continue;
    if (Date.parse(targetLiveDate) < now) continue;
    if (!best || targetLiveDate < best.at) best = { store, at: targetLiveDate };
  }
  return best;
}
