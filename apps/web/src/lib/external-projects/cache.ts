export const EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL =
  'private, no-store, max-age=0';

export function workspaceExternalProjectCacheTag(workspaceId: string) {
  return `external-project-workspace-${workspaceId}`;
}

export function externalProjectAssetCacheTag(assetId: string) {
  return `external-project-asset-${assetId}`;
}

/**
 * Intentionally does nothing. Edge caches key on the workspace's delivery
 * version (delivery-edge-cache.ts, asset-edge-cache.ts), and database triggers
 * bump that version in the same transaction as every content write (migration
 * cms_delivery_version_counter), so a publish needs no purge call. Call sites
 * stay so a mutation path that must purge a future tag-based cache has one
 * place to hook into.
 */
export async function invalidateWorkspaceExternalProjectCache(
  _workspaceId: string,
  _assetIds: string[] = []
) {}
