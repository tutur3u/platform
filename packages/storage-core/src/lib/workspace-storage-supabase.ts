import 'server-only';

import { posix } from 'node:path';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  EMPTY_FOLDER_PLACEHOLDER_NAME,
  type StorageObject,
} from '@tuturuuu/types/primitives/StorageObject';
import { filterDriveListingEntries } from './drive-path-policy';
import { WorkspaceStorageError } from './storage-download-error';
import { stripWorkspaceStoragePrefix } from './workspace-storage-keys';
import { toNumber } from './workspace-storage-listing';
import type {
  WorkspaceStorageListOptions,
  WorkspaceStorageRawObject,
} from './workspace-storage-provider-types';

export const SUPABASE_STORAGE_LIST_PAGE_SIZE = 1000;

export function getSupabaseStorageObjectContentType(entry: StorageObject) {
  const metadata = entry.metadata ?? {};
  return (
    metadata.mimetype ??
    metadata.mimeType ??
    metadata.mediaType ??
    metadata.contentType ??
    null
  );
}

export async function countSupabaseDirectoryEntries(
  supabase: TypedSupabaseClient,
  storagePath: string,
  {
    search,
    serviceRoot,
  }: Pick<WorkspaceStorageListOptions, 'search' | 'serviceRoot'>
) {
  const [wsId = '', ...segments] = storagePath.split('/');
  let offset = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(storagePath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        search,
      });
    if (error) {
      throw new WorkspaceStorageError(error.message || 'Failed to list files');
    }
    const page = data ?? [];
    total += filterDriveListingEntries(
      wsId,
      segments.join('/'),
      page,
      serviceRoot
    ).filter((entry) => entry.name !== EMPTY_FOLDER_PLACEHOLDER_NAME).length;
    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return total;
    }
    offset += page.length;
  }
}
export async function listSupabaseFolderObjectPathsRecursively(
  supabase: TypedSupabaseClient,
  folderPath: string
): Promise<string[]> {
  const objectPaths: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });
    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to list files in folder'
      );
    }
    const page = (data ?? []) as StorageObject[];
    for (const entry of page) {
      if (!entry.name) {
        continue;
      }
      const entryPath = posix.join(folderPath, entry.name);
      if (!entry.id) {
        objectPaths.push(
          ...(await listSupabaseFolderObjectPathsRecursively(
            supabase,
            entryPath
          ))
        );
        continue;
      }
      objectPaths.push(entryPath);
    }
    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return objectPaths;
    }
    offset += page.length;
  }
}
export async function findSupabaseStorageObject(
  supabase: TypedSupabaseClient,
  fullPath: string
): Promise<StorageObject | null> {
  const folderPath = posix.dirname(fullPath);
  const objectName = posix.basename(fullPath);
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit: SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        search: objectName,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });
    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to inspect destination object'
      );
    }
    const page = (data ?? []) as StorageObject[];
    const object = page.find((entry) => entry.id && entry.name === objectName);
    if (object) {
      return object;
    }
    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return null;
    }
    offset += page.length;
  }
}
export async function listSupabaseRawObjectsRecursively(
  supabase: TypedSupabaseClient,
  wsId: string,
  folderPath: string,
  limit?: number
): Promise<WorkspaceStorageRawObject[]> {
  const objects: WorkspaceStorageRawObject[] = [];
  let offset = 0;
  while (true) {
    const remaining = limit ? limit - objects.length : undefined;
    if (remaining !== undefined && remaining <= 0) {
      return objects;
    }
    const { data, error } = await supabase.storage
      .from('workspaces')
      .list(folderPath, {
        limit:
          remaining !== undefined
            ? Math.min(remaining, SUPABASE_STORAGE_LIST_PAGE_SIZE)
            : SUPABASE_STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });
    if (error) {
      throw new WorkspaceStorageError(
        error.message || 'Failed to list Supabase storage objects'
      );
    }
    const page = (data ?? []) as StorageObject[];
    for (const entry of page) {
      if (!entry.name) {
        continue;
      }
      const entryPath = posix.join(folderPath, entry.name);
      if (!entry.id) {
        objects.push(
          ...(await listSupabaseRawObjectsRecursively(
            supabase,
            wsId,
            entryPath,
            remaining
          ))
        );
        if (limit && objects.length >= limit) {
          return objects;
        }
        continue;
      }
      objects.push({
        path: stripWorkspaceStoragePrefix(wsId, entryPath),
        fullPath: entryPath,
        size: toNumber(entry.metadata?.size),
        contentType: getSupabaseStorageObjectContentType(entry),
        updatedAt:
          typeof entry.updated_at === 'string' ? entry.updated_at : null,
        isFolderPlaceholder: entryPath.endsWith(EMPTY_FOLDER_PLACEHOLDER_NAME),
      });
      if (limit && objects.length >= limit) {
        return objects;
      }
    }
    if (page.length < SUPABASE_STORAGE_LIST_PAGE_SIZE) {
      return objects;
    }
    offset += page.length;
  }
}
