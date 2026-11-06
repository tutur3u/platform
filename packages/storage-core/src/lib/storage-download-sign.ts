import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { encodeStoragePath } from '@tuturuuu/utils/storage-path';
import { isSecurityEgressEnforcementEnabled } from './security-budget';
import { clampSignedUrlTtl } from './signed-url-policy';
import {
  createStorageDownloadUrl,
  StorageDownloadError,
} from './storage-download-token';

export async function createGuardedSupabaseStorageReadUrl(
  supabase: TypedSupabaseClient,
  wsId: string,
  path: string,
  requestedExpiresIn?: number,
  transform?: unknown
) {
  // Bearer URLs cannot be revoked: never sign for more than 7 days.
  const expiresIn = clampSignedUrlTtl(requestedExpiresIn);
  if (process.env.STORAGE_DOWNLOADS_DISABLED === 'true') {
    throw new StorageDownloadError(
      'Storage downloads are temporarily disabled',
      503
    );
  }
  try {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .createSignedUrl(encodeStoragePath(path), expiresIn, {
        transform: transform as never,
      });
    if (error || !data?.signedUrl) {
      throw new StorageDownloadError(
        'Failed to generate download URL',
        error &&
          (String(error.status) === '404' || /not found/iu.test(error.message))
          ? 404
          : 502
      );
    }
    // The CDN bearer credential is encrypted, never returned to the caller.
    return isSecurityEgressEnforcementEnabled()
      ? createStorageDownloadUrl(data.signedUrl, wsId, expiresIn)
      : data.signedUrl;
  } catch (error) {
    if (error instanceof StorageDownloadError) throw error;
    // Some URL/fetch errors carry their raw input, including bearer query params.
    throw new StorageDownloadError('Failed to generate download URL', 502);
  }
}
