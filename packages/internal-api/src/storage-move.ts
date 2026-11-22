import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

/** The server accepts at most this many entries per move request. */
export const MAX_WORKSPACE_STORAGE_MOVE_ENTRIES = 20;

export interface WorkspaceStorageMoveEntry {
  name: string;
  isFolder: boolean;
}

export interface WorkspaceStorageMoveResult {
  name: string;
  status: 'moved' | 'conflict' | 'missing' | 'uncertain' | 'skipped';
  totalFiles: number;
  movedFiles: number;
  movedMarkers: number;
}

/**
 * Moves Drive entries between two folders of one workspace. Entries move in
 * order and the server stops at the first one that does not move, so later
 * entries report `skipped`.
 */
export async function moveWorkspaceStorageEntries(
  workspaceId: string,
  payload: {
    sourcePath: string;
    destinationPath: string;
    entries: WorkspaceStorageMoveEntry[];
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const response = await client.json<{ data: WorkspaceStorageMoveResult[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { workspaceId, path: payload.sourcePath },
        destination: { workspaceId, path: payload.destinationPath },
        entries: payload.entries,
      }),
      cache: 'no-store',
    }
  );

  return response.data;
}
