import { revalidateTag } from 'next/cache';
import { userGroupCacheTag } from './server-cache';

/**
 * Invalidate the cached overview data for a user group. Call from mutation
 * routes after a successful write so the next server render reflects the change.
 *
 * Best-effort: cache invalidation must never fail an otherwise-successful
 * mutation, and `revalidateTag` requires a request scope (absent in unit tests),
 * so failures are swallowed. Cached entries also expire via cacheLife.
 */
export function revalidateUserGroupCache(groupId: string) {
  try {
    revalidateTag(userGroupCacheTag(groupId), 'max');
  } catch {
    // Best-effort cache hint; ignore failures (e.g. no request scope in tests).
  }
}
