import { createStorageDownloadUrl } from '@tuturuuu/storage-core/storage-download-token';

/** Existing CMS records may contain raw Supabase links from older clients. */
export function guardExternalProjectAssetSourceUrl(
  value: string,
  wsId: string
) {
  const url = new URL(value);
  const configured = [
    process.env.SUPABASE_SERVER_URL,
    process.env[`${'NEXT_PUBLIC'}_SUPABASE_URL`],
  ];
  if (
    configured.some((origin) => origin && new URL(origin).origin === url.origin)
  ) {
    // Enforces the workspace and signed private bucket scope. Public/raw URLs on
    // our Supabase origin are refused rather than exposed as a bypass.
    return createStorageDownloadUrl(url.toString(), wsId, 3600);
  }
  return url.toString();
}

export { safeExternalProjectDeliverySourceUrl } from './asset-delivery-url';
