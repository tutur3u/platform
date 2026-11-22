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

/** The store dialog's tabs, in order. */
export const STORE_TABS = [
  'overview',
  'screenshots',
  'listing',
  'whats-new',
  'availability',
] as const;
export type StoreTab = (typeof STORE_TABS)[number];

export type StoreSelection = { store: string; tab: StoreTab };

function isStoreTab(value: unknown): value is StoreTab {
  return (STORE_TABS as readonly unknown[]).includes(value);
}

/**
 * The store dialog a URL opens: `?store=ios&tab=screenshots`. An unknown
 * store opens nothing; a missing or unknown tab opens Overview.
 */
export function storeSelection(
  search: Readonly<Record<string, unknown>>,
  ids: readonly string[]
): StoreSelection | null {
  const store = search.store;
  if (typeof store !== 'string' || !ids.includes(store)) return null;
  return { store, tab: isStoreTab(search.tab) ? search.tab : 'overview' };
}

/** The search params with the dialog's state set, or removed for null. */
export function withStoreSelection(
  search: Readonly<Record<string, unknown>>,
  selection: StoreSelection | null
): Record<string, unknown> {
  const { store: _store, tab: _tab, ...rest } = search;
  return selection
    ? { ...rest, store: selection.store, tab: selection.tab }
    : rest;
}

export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';

export type ReleaseStep = {
  id: 'submission' | 'review' | 'release';
  state: StepState;
  /** When it happened, or its target while it has not. */
  at: string | null;
  /** True while `at` is a target rather than a fact. */
  planned: boolean;
};

/**
 * Submission, review and release as three steps. A step is done once its
 * fact exists (a later fact implies the earlier ones); the first step not
 * done is current, and a rejection blocks review.
 */
export function releaseSteps(release: StoreMetadata['release']): ReleaseStep[] {
  const released = Boolean(release.liveAt) || release.status === 'live';
  const approved =
    released || Boolean(release.approvedAt) || release.status === 'approved';
  const submitted =
    approved ||
    Boolean(release.submittedAt) ||
    ['submitted', 'in_review', 'rejected'].includes(release.status);
  const steps: Omit<ReleaseStep, 'state'>[] = [
    {
      id: 'submission',
      at: release.submittedAt ?? release.targetSubmitDate,
      planned: !release.submittedAt,
    },
    { id: 'review', at: release.approvedAt, planned: false },
    {
      id: 'release',
      at: release.liveAt ?? release.targetLiveDate,
      planned: !release.liveAt,
    },
  ];
  const done = [submitted, approved, released];
  const current = done.indexOf(false);
  return steps.map((step, index) => ({
    ...step,
    // A planned date on a step that is already done is not shown as a plan.
    planned: done[index] ? false : step.planned,
    at: done[index] && step.planned ? null : step.at,
    state: done[index]
      ? 'done'
      : index === current
        ? step.id === 'review' && release.status === 'rejected'
          ? 'blocked'
          : 'current'
        : 'upcoming',
  }));
}
