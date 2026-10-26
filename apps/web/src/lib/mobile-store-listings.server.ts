import 'server-only';
import { cacheLife } from 'next/cache';
import {
  ANDROID_PACKAGE_ID,
  androidTestingUrl,
  type MobileStoreListing,
  parseStoreListing,
} from './download-platform';
import { getMobileVersionPolicies } from './mobile-version-policy';

export type MobileStoreListings = {
  ios: MobileStoreListing | null;
  android: MobileStoreListing;
};

// The mobile version policy (root workspace config) is the source of truth for
// store links and the current release. A missing policy shows the store link
// without a version rather than a guessed one. The version shown is the
// policy's effective version.
export async function getMobileStoreListings(): Promise<MobileStoreListings> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  let policies: Awaited<ReturnType<typeof getMobileVersionPolicies>> | null =
    null;
  try {
    policies = await getMobileVersionPolicies();
  } catch (error) {
    console.warn('Failed to load mobile store listings', error);
  }
  return {
    ios: parseStoreListing(
      'ios',
      policies?.ios.storeUrl,
      policies?.ios.effectiveVersion
    ),
    android: parseStoreListing(
      'android',
      policies?.android.storeUrl,
      policies?.android.effectiveVersion
    ) ?? {
      url: androidTestingUrl(ANDROID_PACKAGE_ID),
      version: null,
      kind: 'beta',
    },
  };
}
