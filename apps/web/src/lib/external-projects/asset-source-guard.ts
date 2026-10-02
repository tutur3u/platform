import { isSecurityEgressEnforcementEnabled } from '@tuturuuu/storage-core/security-budget';
import { createStorageDownloadUrl } from '@tuturuuu/storage-core/storage-download-token';

/** Existing CMS records may contain raw Supabase links from older clients. */
export function guardExternalProjectAssetSourceUrl(
  value: string,
  wsId: string
) {
  if (!isSecurityEgressEnforcementEnabled()) return value;
  const url = new URL(value);
  const configured = [
    process.env.SUPABASE_SERVER_URL,
    process.env[`${'NEXT_PUBLIC'}_SUPABASE_URL`],
  ];
  if (
    configured.some((origin) => origin && new URL(origin).origin === url.origin)
  ) {
    if (
      /^\/storage\/v1\/(?:object|render\/image)\/public\//u.test(url.pathname)
    )
      return url.toString();
    // Enforce the workspace and signed private bucket scope.
    return createStorageDownloadUrl(url.toString(), wsId, 3600);
  }
  return url.toString();
}

export { safeExternalProjectDeliverySourceUrl } from './asset-delivery-url';
