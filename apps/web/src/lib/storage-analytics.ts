import { posix } from 'node:path';
import { EMPTY_FOLDER_PLACEHOLDER_NAME } from '@tuturuuu/types/primitives/StorageObject';

const STORAGE_ANALYTICS_PAGE_SIZE = 1000;

type StorageListEntry = {
  id?: string | null;
  name?: string;
  created_at?: string | null;
  metadata?: {
    size?: number | null;
  } | null;
};

export interface WorkspaceStorageMetrics {
  fileCount: number;
  largestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
  smallestFile: {
    name: string;
    size: number;
    createdAt?: string | null;
  } | null;
}

function normalizeRelativePath(path?: string) {
  return (path ?? '').replace(/^\/+|\/+$/g, '');
}

function buildWorkspaceStoragePath(wsId: string, path?: string) {
  const normalizedPath = normalizeRelativePath(path);
  return normalizedPath ? posix.join(wsId, normalizedPath) : wsId;
}

function matchesSearch(entryName: string, search?: string) {
  const normalizedSearch = search?.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return entryName.toLowerCase().includes(normalizedSearch);
}

async function walkWorkspaceStorage(
  supabase: any,
  workspacePath: string,
  onFile: (
    file: Required<Pick<StorageListEntry, 'name'>> & StorageListEntry
  ) => void
) {
  const pendingPaths = [workspacePath];

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.pop();
    if (!currentPath) {
      continue;
    }

    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage
        .from('workspaces')
        .list(currentPath, {
          limit: STORAGE_ANALYTICS_PAGE_SIZE,
          offset,
          sortBy: {
            column: 'name',
            order: 'asc',
          },
        });

      if (error) {
        throw new Error(error.message || 'Failed to list storage objects');
      }

      const entries = data ?? [];

      for (const entry of entries) {
        if (!entry.name || entry.name === EMPTY_FOLDER_PLACEHOLDER_NAME) {
          continue;
        }

        if (entry.id) {
          onFile({ ...entry, name: entry.name });
          continue;
        }

        pendingPaths.push(posix.join(currentPath, entry.name));
      }

      if (entries.length < STORAGE_ANALYTICS_PAGE_SIZE) {
        break;
      }

      offset += entries.length;
    }
  }
}

export async function getWorkspaceStorageMetrics(
  supabase: any,
  wsId: string
): Promise<WorkspaceStorageMetrics> {
  let fileCount = 0;
  let largestFile: WorkspaceStorageMetrics['largestFile'] = null;
  let smallestFile: WorkspaceStorageMetrics['smallestFile'] = null;

  await walkWorkspaceStorage(
    supabase,
    buildWorkspaceStoragePath(wsId),
    (file) => {
      const size = Number(file.metadata?.size ?? 0);
      const record = {
        name: file.name,
        size,
        createdAt: file.created_at,
      };

      fileCount += 1;

      if (!largestFile || size > largestFile.size) {
        largestFile = record;
      }

      if (!smallestFile || size < smallestFile.size) {
        smallestFile = record;
      }
    }
  );

  return {
    fileCount,
    largestFile,
    smallestFile,
  };
}

export async function countWorkspaceStorageObjects(
  supabase: any,
  wsId: string,
  options?: {
    path?: string;
    search?: string;
  }
) {
  let fileCount = 0;
  const workspacePath = buildWorkspaceStoragePath(wsId, options?.path);

  await walkWorkspaceStorage(supabase, workspacePath, (file) => {
    if (matchesSearch(file.name, options?.search)) {
      fileCount += 1;
    }
  });

  return fileCount;
}
