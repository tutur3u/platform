import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { relayStorageDownload } from './storage-download-relay';
import { createGuardedSupabaseStorageReadUrl } from './storage-download-sign';
import { StorageDownloadError } from './storage-download-token';

/** CMS WebGL and server consumers share the same budget as browser downloads. */
export async function downloadGuardedSupabaseStorageObject(
  supabase: TypedSupabaseClient,
  wsId: string,
  path: string
) {
  const url = await createGuardedSupabaseStorageReadUrl(supabase, wsId, path);
  const token = new URL(url).pathname.split('/').at(-1)!;
  const response = await relayStorageDownload(new Request(url), token);
  if (!response.ok) {
    throw new StorageDownloadError(
      'Storage download unavailable',
      response.status
    );
  }
  return {
    buffer: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}
