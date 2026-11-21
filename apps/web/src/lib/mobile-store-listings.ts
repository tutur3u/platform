import {
  ANDROID_PACKAGE_ID,
  ANDROID_PUBLICLY_LISTED,
  androidTestingUrl,
  parseReleaseVersion,
  parseStoreListing,
  type ReleaseVersion,
} from './download-platform';

export type MobileStoreChannel = {
  url: string;
  release: ReleaseVersion | null;
};

// The public store listing and the beta program link. Beta builds ride the
// shared desktop-v* release train, so their version is resolved from that
// release rather than from store configuration.
export type MobileChannels = {
  store: MobileStoreChannel | null;
  betaUrl: string | null;
};

export type MobileStoreListings = Record<'ios' | 'android', MobileChannels>;

export type MobileChannelSource = {
  storeUrl?: string | null;
  effectiveVersion?: string | null;
};

// A public listing becomes the store channel; a TestFlight or Play testing
// link becomes the beta channel. Android always has a testing link because
// it is rebuilt from the validated package id.
export function resolveMobileChannels(
  platform: 'ios' | 'android',
  source: MobileChannelSource,
  { androidPubliclyListed = ANDROID_PUBLICLY_LISTED } = {}
): MobileChannels {
  const listing = parseStoreListing(
    platform,
    source.storeUrl,
    source.effectiveVersion,
    { androidPubliclyListed }
  );
  const store =
    listing?.kind === 'store'
      ? { url: listing.url, release: parseReleaseVersion(listing.version) }
      : null;
  const betaUrl =
    listing?.kind === 'beta'
      ? listing.url
      : platform === 'android'
        ? androidTestingUrl(
            listing ? packageIdOf(listing.url) : ANDROID_PACKAGE_ID
          )
        : null;
  return { store, betaUrl };
}

function packageIdOf(url: string) {
  return new URL(url).searchParams.get('id') ?? ANDROID_PACKAGE_ID;
}
