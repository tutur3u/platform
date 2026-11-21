import 'server-only';
import { cacheLife } from 'next/cache';
import {
  type MobileStoreListings,
  resolveMobileChannels,
} from './mobile-store-listings';
import { getMobileVersionPolicies } from './mobile-version-policy';

export type { MobileStoreListings } from './mobile-store-listings';

// The human-set mobile version policy (root workspace config) is the source
// of truth for public store links and versions; it also drives in-app update
// prompts. A failed read shows no version rather than a guessed one.
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
    ios: resolveMobileChannels('ios', {
      storeUrl: policies?.ios.storeUrl,
      effectiveVersion: policies?.ios.effectiveVersion,
    }),
    android: resolveMobileChannels('android', {
      storeUrl: policies?.android.storeUrl,
      effectiveVersion: policies?.android.effectiveVersion,
    }),
  };
}
