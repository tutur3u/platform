import { invalidateByTag } from '@vercel/functions';

export const EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL =
  'private, no-store, max-age=0';

export function workspaceExternalProjectCacheTag(workspaceId: string) {
  return `external-project-workspace-${workspaceId}`;
}

export function externalProjectAssetCacheTag(assetId: string) {
  return `external-project-asset-${assetId}`;
}

export async function invalidateWorkspaceExternalProjectCache(
  workspaceId: string,
  assetIds: string[] = []
) {
  if (!process.env.VERCEL) return;

  await invalidateByTag([
    workspaceExternalProjectCacheTag(workspaceId),
    ...assetIds.map(externalProjectAssetCacheTag),
  ]);
}
