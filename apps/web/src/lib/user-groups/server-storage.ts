import { listWorkspaceStorageDirectory } from '@tuturuuu/storage-core/workspace-storage-provider';
import { cache } from 'react';

/**
 * Storage files for a group, listed server-side. Mirrors the storage route.
 *
 * Kept separate from `server-data.ts` because `workspace-storage-provider`
 * imports `server-only`, which must not be pulled into modules that are also
 * consumed by route handlers / their tests.
 */
export const getGroupStorageFiles = cache(
  async (wsId: string, groupId: string) => {
    try {
      const result = await listWorkspaceStorageDirectory(wsId, {
        path: `user-groups/${groupId}`,
      });
      return result.data ?? [];
    } catch {
      return [];
    }
  }
);
