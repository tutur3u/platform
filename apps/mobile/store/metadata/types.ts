// Types for the public store listings in this directory. They mirror
// schema.json; scripts/store-metadata/validate.test.mjs fails when a schema
// property is missing here.

export type StoreLocale = 'en' | 'vi';

/** Every user-visible string carries both languages. */
export type Localized<T = string> = Record<StoreLocale, T>;

/** ISO 8601 date-time with an explicit offset, e.g. 2026-11-28T23:59:00+07:00. */
export type IsoDateTime = string;

/** HTTPS URL on tuturuuu.com, apps.apple.com, play.google.com or apps.microsoft.com. */
export type PublicUrl = string;

export type StoreId =
  | 'app-store-ios'
  | 'app-store-macos'
  | 'google-play'
  | 'microsoft-store';

export type StoreSlug = 'ios' | 'macos' | 'android' | 'windows';

export type StoreReleaseStatus =
  | 'planned'
  | 'preparing'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'live'
  | 'rejected';

export interface StoreRelease {
  status: StoreReleaseStatus;
  version: string;
  build: string;
  targetSubmitDate: IsoDateTime;
  targetLiveDate: IsoDateTime;
  submittedAt: IsoDateTime | null;
  approvedAt: IsoDateTime | null;
  liveAt: IsoDateTime | null;
  storeUrl: PublicUrl | null;
}

export interface StoreUrls {
  privacy: PublicUrl;
  support: PublicUrl;
  marketing: PublicUrl;
  accountDeletion: PublicUrl;
}

export interface StoreDeviceSize {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface StoreGraphic {
  file: string;
  width: number;
  height: number;
}

export interface StoreScreenshot {
  id: string;
  /** apps/mobile/store/screenshots/<slug>/<device>/<locale>/NN-<id>.jpg */
  files: Localized;
  caption: Localized;
}

/** WebP, long edge at most 1280 px, at most 150 KB; at most 6 per platform. */
export interface StoreGalleryItem {
  /** apps/mobile/store/screenshots/<slug>/web/NN-<id>.webp */
  file: string;
  width: number;
  height: number;
  alt: Localized;
}

export interface AppStoreListingCopy {
  name: Localized;
  nameFallback?: Localized;
  subtitle: Localized;
  promotionalText: Localized;
  description: Localized;
  keywords: Localized;
  whatsNew: Localized | null;
}

export interface GooglePlayListingCopy {
  title: Localized;
  shortDescription: Localized;
  fullDescription: Localized;
  whatsNew: Localized | null;
}

export interface MicrosoftStoreListingCopy {
  name: Localized;
  shortDescription: Localized;
  description: Localized;
  features: Localized[];
  searchTerms: Localized[];
  releaseNotes: Localized | null;
}

interface StoreListingBase<Store extends StoreId, Slug extends StoreSlug> {
  $schema?: string;
  store: Store;
  slug: Slug;
  platform: string;
  productId: string;
  category: string;
  release: StoreRelease;
  urls: StoreUrls;
  screenshotDevices: Record<string, StoreDeviceSize>;
  screenshots: Record<string, StoreScreenshot[]>;
  gallery: StoreGalleryItem[];
}

export interface AppStoreListing
  extends StoreListingBase<'app-store-ios', 'ios'> {
  listing: AppStoreListingCopy;
}

export interface MacAppStoreListing
  extends StoreListingBase<'app-store-macos', 'macos'> {
  listing: AppStoreListingCopy;
}

export interface GooglePlayListing
  extends StoreListingBase<'google-play', 'android'> {
  listing: GooglePlayListingCopy;
  graphics: { icon: StoreGraphic; featureGraphic: StoreGraphic };
}

export interface MicrosoftStoreListing
  extends StoreListingBase<'microsoft-store', 'windows'> {
  listing: MicrosoftStoreListingCopy;
  graphics: { tile: StoreGraphic; hero: StoreGraphic };
}

export type StoreListing =
  | AppStoreListing
  | MacAppStoreListing
  | GooglePlayListing
  | MicrosoftStoreListing;
