import android from '../../../../../apps/mobile/store/metadata/android.json';
import ios from '../../../../../apps/mobile/store/metadata/ios.json';
import macos from '../../../../../apps/mobile/store/metadata/macos.json';
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

type Listing = {
  title?: Localized;
  name?: Localized;
  description?: Localized;
  fullDescription?: Localized;
};

function entry(
  id: 'ios' | 'macos' | 'android' | 'windows',
  name: string,
  metadata: StoreMetadata & { listing: Listing },
  manifest: { source: string }
) {
  const { listing } = metadata;
  return {
    id,
    name,
    platform: metadata.platform,
    release: metadata.release,
    title: (listing.title ?? listing.name) as Localized,
    description: (listing.fullDescription ?? listing.description) as Localized,
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
