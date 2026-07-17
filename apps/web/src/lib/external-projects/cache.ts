import { invalidateByTag } from '@vercel/functions';

export const EXTERNAL_PROJECT_PUBLIC_CACHE_CONTROL =
  'public, max-age=0, s-maxage=86400, stale-while-revalidate=43200';
export const EXTERNAL_PROJECT_ASSET_REDIRECT_CACHE_CONTROL =
  'public, max-age=300, s-maxage=518400, stale-while-revalidate=43200';
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
