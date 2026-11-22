import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { getStorageObjectDisplayName } from './storage-display-name';

const DOWNLOAD_LINK_TTL_SECONDS = 60 * 60;

/** Refresh a signed link halfway through the lifetime the server reports. */
export function getSignedLinkStaleTime(expiresIn: number | null | undefined) {
  return expiresIn ? (expiresIn * 1000) / 2 : 5 * 60 * 1000;
}

export function getDriveObjectPath(path: string, item: StorageObject) {
  return path ? `${path}/${item.name ?? ''}` : (item.name ?? '');
}

export function createDriveDownloadUrl(
  wsId: string,
  path: string,
  item: StorageObject
) {
  return createWorkspaceStorageSignedUrl(
    wsId,
    joinPath(path, item.name ?? ''),
    DOWNLOAD_LINK_TTL_SECONDS,
    undefined,
    { fetch }
  );
}

/**
 * Saves files one at a time under their display names. The signed URL is on
 * the storage provider's origin, where an anchor's download attribute is
 * ignored, so each file is fetched into a blob first.
 */
export async function downloadDriveFiles(
  wsId: string,
  path: string,
  files: StorageObject[]
) {
  for (const file of files) {
    const response = await fetch(
      await createDriveDownloadUrl(wsId, path, file),
      {
        cache: 'no-store',
      }
    );
    if (!response.ok) throw new Error(`Download failed (${response.status})`);

    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getStorageObjectDisplayName(file) || file.name || '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
