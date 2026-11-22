import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { getStorageObjectDisplayName } from './storage-display-name';

const DOWNLOAD_LINK_TTL_SECONDS = 60 * 60;

/** Lifetime Drive requests for thumbnails and previews; the server default. */
export const SIGNED_LINK_TTL_SECONDS = 60 * 60;

const SIGNED_LINK_REFRESH_MARGIN_MS = 10 * 60 * 1000;

/**
 * Downloads at or above this size are still buffered in memory: the share
 * route cannot sign a link with a download disposition, and a cross-origin
 * anchor ignores its download attribute.
 */
export const LARGE_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/** Revoking an object URL in the same task can cancel the save in Safari. */
const OBJECT_URL_REVOKE_DELAY_MS = 60 * 1000;

/**
 * How long a signed link stays fresh: its lifetime minus a refresh margin
 * (at most half the lifetime). An unreported lifetime falls back to the one
 * requested, which the server never clamps below the default.
 */
export function getSignedLinkStaleTime(
  expiresIn: number | null | undefined,
  requestedSeconds = SIGNED_LINK_TTL_SECONDS
) {
  const lifetimeMs = (expiresIn || requestedSeconds) * 1000;
  return lifetimeMs - Math.min(SIGNED_LINK_REFRESH_MARGIN_MS, lifetimeMs / 2);
}

/** Keeps an unused signed link cached for its whole lifetime. */
export const SIGNED_LINK_GC_TIME_MS = SIGNED_LINK_TTL_SECONDS * 1000;

export function getDriveObjectPath(path: string, item: StorageObject) {
  return path ? `${path}/${item.name ?? ''}` : (item.name ?? '');
}

export function hasLargeDownload(files: StorageObject[]) {
  return files.some((file) => {
    const size = file.metadata?.size;
    return typeof size === 'number' && size >= LARGE_DOWNLOAD_BYTES;
  });
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
    setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
  }
}
