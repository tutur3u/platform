import android from '../../../../../apps/mobile/store/metadata/android.json';
import ios from '../../../../../apps/mobile/store/metadata/ios.json';
import macos from '../../../../../apps/mobile/store/metadata/macos.json';
import type {
  AppStoreListingCopy,
  GooglePlayListingCopy,
  MicrosoftStoreListingCopy,
  StoreDeviceSize,
  StoreUrls,
} from '../../../../../apps/mobile/store/metadata/types';
import windows from '../../../../../apps/mobile/store/metadata/windows.json';
import androidManifest from '../../../../../apps/mobile/store/screenshots/android/web/manifest.json';
import iosManifest from '../../../../../apps/mobile/store/screenshots/ios/web/manifest.json';
import macosManifest from '../../../../../apps/mobile/store/screenshots/macos/web/manifest.json';
import windowsManifest from '../../../../../apps/mobile/store/screenshots/windows/web/manifest.json';
import {
  type Localized,
  type StoreMetadata,
  storeShots,
} from '../../content/store-releases';

const urls = import.meta.glob<string>(
  '../../../../../apps/mobile/store/screenshots/{ios,macos,android,windows}/web/*.webp',
  { eager: true, import: 'default', query: '?no-inline' }
);
const resolve = (file: string) => `../../../../../${file}`;

type Listing = Partial<
  AppStoreListingCopy & GooglePlayListingCopy & MicrosoftStoreListingCopy
>;

type Metadata = StoreMetadata & {
  category: string;
  urls: StoreUrls;
  screenshotDevices: Record<string, StoreDeviceSize>;
  release: StoreMetadata['release'] & { storeUrl?: string | null };
  listing: Listing;
};

/** "1284 × 2778", or "1920 × 1080+" for a minimum size. */
function deviceSize(size: StoreDeviceSize) {
  if (size.width && size.height) return `${size.width} × ${size.height}`;
  if (size.minWidth && size.minHeight)
    return `${size.minWidth} × ${size.minHeight}+`;
  return null;
}

function entry(
  id: 'ios' | 'macos' | 'android' | 'windows',
  name: string,
  metadata: Metadata,
  manifest: { source: string }
) {
  const { listing } = metadata;
  const title = (listing.title ?? listing.name) as Localized;
  // App Store keywords are one comma-separated string per language; the
  // Microsoft Store lists search terms one by one.
  const keywords: Record<'en' | 'vi', string[]> = listing.keywords
    ? {
        en: listing.keywords.en.split(',').map((word) => word.trim()),
        vi: listing.keywords.vi.split(',').map((word) => word.trim()),
      }
    : {
        en: (listing.searchTerms ?? []).map((term) => term.en),
        vi: (listing.searchTerms ?? []).map((term) => term.vi),
      };
  return {
    id,
    name,
    platform: metadata.platform,
    category: metadata.category,
    release: metadata.release,
    storeUrl: metadata.release.storeUrl ?? null,
    title,
    subtitle: (listing.subtitle ??
      listing.shortDescription ??
      null) as Localized | null,
    promotion: (listing.promotionalText ?? null) as Localized | null,
    description: (listing.fullDescription ?? listing.description) as Localized,
    keywords,
    features: (listing.features ?? []) as readonly Localized[],
    whatsNew: (listing.whatsNew ??
      listing.releaseNotes ??
      null) as Localized | null,
    languages: Object.keys(title) as ('en' | 'vi')[],
    links: metadata.urls,
    devices: Object.entries(metadata.screenshotDevices).map(
      ([device, size]) => ({
        id: device,
        size: deviceSize(size),
      })
    ),
    ...storeShots(metadata, manifest, urls, resolve),
  };
}

export const STORES = [
  entry('ios', 'iOS App Store', ios as never, iosManifest),
  entry('macos', 'Mac App Store', macos as never, macosManifest),
  entry('android', 'Google Play', android as never, androidManifest),
  entry('windows', 'Microsoft Store', windows as never, windowsManifest),
] as const;

export type Store = (typeof STORES)[number];

export const STORE_IDS: readonly string[] = STORES.map((store) => store.id);
