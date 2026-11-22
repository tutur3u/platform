import { InternalApiError } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { type DriveTypeFilter, getDriveFileKind } from './drive-file-kind';

export type DriveAccess = 'manage' | 'denied';

/** Every state the file browser surface can render; exactly one at a time. */
export type DriveBrowserState =
  | { kind: 'denied' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty-root' }
  | { kind: 'empty-folder' }
  | { kind: 'no-results'; query: string; type: DriveTypeFilter | null }
  /** The type chip matches nothing loaded, but later pages may match. */
  | { kind: 'filtering-more'; type: DriveTypeFilter }
  | {
      kind: 'ready';
      folders: StorageObject[];
      files: StorageObject[];
      /** Loaded items hidden by the type chip. */
      hiddenByType: number;
    };

export interface DriveBrowserInput {
  access: DriveAccess;
  error: unknown;
  /** Whether the list endpoint has pages that are not loaded yet. */
  hasMore: boolean;
  items: StorageObject[] | undefined;
  path: string;
  query: string;
  status: 'pending' | 'error' | 'success';
  type: DriveTypeFilter | null;
}

export function isDriveAccessDenied(error: unknown) {
  return error instanceof InternalApiError && error.status === 403;
}

export function splitDriveItems(items: StorageObject[]) {
  const folders: StorageObject[] = [];
  const files: StorageObject[] = [];
  for (const item of items) (item.id ? files : folders).push(item);
  return { folders, files };
}

export function resolveDriveBrowserState({
  access,
  error,
  hasMore,
  items,
  path,
  query,
  status,
  type,
}: DriveBrowserInput): DriveBrowserState {
  if (access === 'denied' || isDriveAccessDenied(error)) {
    return { kind: 'denied' };
  }
  // A refetch error keeps showing the loaded items.
  if (!items)
    return status === 'error' ? { kind: 'error' } : { kind: 'loading' };

  const trimmedQuery = query.trim();
  const { folders, files: allFiles } = splitDriveItems(items);
  const files = type
    ? allFiles.filter((file) => getDriveFileKind(file) === type)
    : allFiles;

  if (folders.length === 0 && files.length === 0) {
    // The type chip filters loaded items only; the query is server-side.
    if (type && hasMore) return { kind: 'filtering-more', type };
    if (trimmedQuery || type) {
      return { kind: 'no-results', query: trimmedQuery, type };
    }
    return path ? { kind: 'empty-folder' } : { kind: 'empty-root' };
  }

  return {
    kind: 'ready',
    folders,
    files,
    hiddenByType: allFiles.length - files.length,
  };
}
