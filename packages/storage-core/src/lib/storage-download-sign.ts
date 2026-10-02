import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  createStorageDownloadUrl,
  StorageDownloadError,
} from './storage-download-token';

export async function createGuardedSupabaseStorageReadUrl(
  supabase: TypedSupabaseClient,
  wsId: string,
  path: string,
  expiresIn = 3600,
  transform?: unknown
) {
  if (process.env.STORAGE_DOWNLOADS_DISABLED === 'true') {
    throw new StorageDownloadError(
      'Storage downloads are temporarily disabled',
      503
    );
  }
  try {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .createSignedUrl(path, expiresIn, { transform: transform as never });
    if (error || !data?.signedUrl) {
      throw new StorageDownloadError('Failed to generate download URL', 502);
    }
    // The CDN bearer credential is encrypted, never returned to the caller.
    return createStorageDownloadUrl(data.signedUrl, wsId, expiresIn);
  } catch (error) {
    if (error instanceof StorageDownloadError) throw error;
    // Some URL/fetch errors carry their raw input, including bearer query params.
    throw new StorageDownloadError('Failed to generate download URL', 502);
  }
}
