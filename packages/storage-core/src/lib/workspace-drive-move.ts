import 'server-only';

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { EMPTY_FOLDER_PLACEHOLDER_NAME } from '@tuturuuu/types/primitives/StorageObject';
import { sanitizePathSegments } from '@tuturuuu/utils/storage-path';
import { WorkspaceStorageError } from './storage-download-error';
import { WORKSPACE_STORAGE_PROVIDER_SUPABASE } from './workspace-storage-config';
import { assertWorkspaceStoragePathAllowed } from './workspace-storage-path-access';
import { resolveWorkspaceStorageProvider } from './workspace-storage-provider';

export const MAX_DRIVE_MOVE_ENTRIES = 20;
const MAX_MOVE_OBJECTS = 64;
const MAX_MOVE_BYTES = 2 * 1024 ** 3;
const MAX_MOVE_LIST_REQUESTS = 64;
const MAX_PATH_BYTES = 960;
const options = { driveOnly: true };

export class DriveMoveError extends WorkspaceStorageError {
  constructor(
    public readonly code:
      | 'DRIVE_MOVE_CONFLICT'
      | 'DRIVE_MOVE_PROVIDER'
      | 'DRIVE_MOVE_SIZE',
    message: string
  ) {
    super(message, 409);
  }
}

export interface DriveMoveEntry {
  name: string;
  isFolder: boolean;
}

interface DriveMoveInput {
  sourcePath: string;
  destinationPath: string;
  entries: DriveMoveEntry[];
}

export interface DriveMoveResult {
  name: string;
  status: 'moved' | 'conflict' | 'missing' | 'uncertain' | 'skipped';
  totalFiles: number;
  movedFiles: number;
  movedMarkers: number;
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function assertPath(wsId: string, path: string) {
  if (
    !sanitizePathSegments(path) ||
    Buffer.byteLength(path, 'utf8') > MAX_PATH_BYTES
  ) {
    throw new WorkspaceStorageError('Invalid storage path', 400);
  }
  if (path) assertWorkspaceStoragePathAllowed(wsId, path, options);
}

function assertName(name: string) {
  if (
    sanitizePathSegments(name)?.length !== 1 ||
    name === EMPTY_FOLDER_PLACEHOLDER_NAME
  ) {
    throw new WorkspaceStorageError('Invalid entry name', 400);
  }
}

export async function moveWorkspaceDriveEntries(
  wsId: string,
  { sourcePath, destinationPath, entries }: DriveMoveInput,
  signal: AbortSignal
): Promise<DriveMoveResult[]> {
  if (!entries.length || entries.length > MAX_DRIVE_MOVE_ENTRIES) {
    throw new WorkspaceStorageError('Invalid number of entries', 400);
  }
  assertPath(wsId, sourcePath);
  assertPath(wsId, destinationPath);
  if (sourcePath === destinationPath) {
    throw new WorkspaceStorageError('Choose a different folder', 400);
  }

  const names = new Set<string>();
  for (const { name, isFolder } of entries) {
    assertName(name);
    if (names.has(name)) {
      throw new WorkspaceStorageError('Duplicate move entry', 400);
    }
    names.add(name);
    const source = joinPath(sourcePath, name);
    assertPath(wsId, source);
    assertPath(wsId, joinPath(destinationPath, name));
    if (
      isFolder &&
      (destinationPath === source || destinationPath.startsWith(`${source}/`))
    ) {
      throw new WorkspaceStorageError(
        'A folder cannot be moved into itself or a descendant',
        400
      );
    }
  }

  const { provider, misconfigured } =
    await resolveWorkspaceStorageProvider(wsId);
  if (misconfigured || provider !== WORKSPACE_STORAGE_PROVIDER_SUPABASE) {
    throw new DriveMoveError(
      'DRIVE_MOVE_PROVIDER',
      'Moving entries is unavailable for this storage provider'
    );
  }

  const admin = await createDynamicAdminClient();
  const storage = admin.storage.from('workspaces');
  const key = (path: string) => (path ? `${wsId}/${path}` : wsId);
  let readCount = 0;
  let planning = true;
  async function list(path: string, limit: number, search?: string) {
    if (planning && ++readCount > MAX_MOVE_LIST_REQUESTS) {
      throw new WorkspaceStorageError('Too many folders to move at once', 413);
    }
    if (signal.aborted) {
      throw new WorkspaceStorageError('Move cancelled before writing', 408);
    }
    const { data, error } = await storage.list(key(path), {
      limit,
      search,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data) {
      throw new WorkspaceStorageError('Could not inspect the move paths');
    }
    return data;
  }

  async function findEntry(parent: string, name: string) {
    const limit = MAX_MOVE_OBJECTS + 1;
    const matches = await list(parent, limit, name);
    const exact = matches.find((entry) => entry.name === name);
    if (!exact && matches.length >= limit) {
      throw new WorkspaceStorageError('Too many matching names to check', 413);
    }
    return exact;
  }

  if (destinationPath && !(await list(destinationPath, 1)).length) {
    throw new WorkspaceStorageError('Destination folder not found', 404);
  }

  const plan: {
    name: string;
    isFolder: boolean;
    objects: { source: string; parent: string; name: string }[];
  }[] = [];
  let objectCount = 0;
  let totalBytes = 0;
  for (const { name, isFolder } of entries) {
    const source = joinPath(sourcePath, name);
    const destination = joinPath(destinationPath, name);
    const sourceEntry = await findEntry(sourcePath, name);
    if (!sourceEntry || isFolder !== !sourceEntry.id) {
      throw new WorkspaceStorageError('Source entry not found', 404);
    }
    if (await findEntry(destinationPath, name)) {
      throw new DriveMoveError(
        'DRIVE_MOVE_CONFLICT',
        'An entry with that name already exists'
      );
    }

    const objects: (typeof plan)[number]['objects'] = [];
    function addObject(
      from: string,
      parent: string,
      name: string,
      size: unknown
    ) {
      assertPath(wsId, from);
      assertPath(wsId, joinPath(parent, name));
      if (++objectCount > MAX_MOVE_OBJECTS) {
        throw new WorkspaceStorageError('Too many files to move at once', 413);
      }
      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
        throw new DriveMoveError(
          'DRIVE_MOVE_SIZE',
          'Could not verify the size of an entry'
        );
      }
      totalBytes += size;
      if (totalBytes > MAX_MOVE_BYTES) {
        throw new WorkspaceStorageError(
          'Total size exceeds the move limit',
          413
        );
      }
      objects.push({ source: key(from), parent, name });
    }

    if (isFolder) {
      const folders = [{ source, destination }];
      for (const folder of folders) {
        const children = await list(folder.source, MAX_MOVE_OBJECTS + 1);
        if (children.length > MAX_MOVE_OBJECTS) {
          throw new WorkspaceStorageError(
            'Too many files to move at once',
            413
          );
        }
        for (const child of children) {
          if (sanitizePathSegments(child.name)?.length !== 1) {
            throw new WorkspaceStorageError('Invalid stored entry name', 409);
          }
          const from = joinPath(folder.source, child.name);
          const to = joinPath(folder.destination, child.name);
          if (child.id) {
            addObject(
              from,
              folder.destination,
              child.name,
              child.metadata?.size
            );
          } else {
            assertPath(wsId, from);
            assertPath(wsId, to);
            folders.push({ source: from, destination: to });
          }
        }
      }
      if (!objects.length) {
        throw new WorkspaceStorageError('Source folder not found', 404);
      }
    } else {
      addObject(source, destinationPath, name, sourceEntry.metadata?.size);
    }
    plan.push({ name, isFolder, objects });
  }

  planning = false;
  const results: DriveMoveResult[] = [];
  let stopped = false;
  for (const { name, isFolder, objects } of plan) {
    const result: DriveMoveResult = {
      name,
      status: 'skipped',
      totalFiles: objects.filter(
        (object) => object.name !== EMPTY_FOLDER_PLACEHOLDER_NAME
      ).length,
      movedFiles: 0,
      movedMarkers: 0,
    };
    results.push(result);
    if (stopped || signal.aborted) continue;

    try {
      if (isFolder && (await findEntry(destinationPath, name))) {
        result.status = 'conflict';
        stopped = true;
        continue;
      }
    } catch {
      result.status = signal.aborted ? 'skipped' : 'uncertain';
      stopped = true;
      continue;
    }

    result.status = 'moved';
    for (const object of objects) {
      if (signal.aborted) {
        result.status = 'skipped';
        break;
      }
      try {
        if (await findEntry(object.parent, object.name)) {
          result.status = 'conflict';
          break;
        }
        if (signal.aborted) {
          result.status = 'skipped';
          break;
        }
        const { error } = await storage.move(
          object.source,
          key(joinPath(object.parent, object.name))
        );
        if (!error) {
          if (object.name === EMPTY_FOLDER_PLACEHOLDER_NAME) {
            result.movedMarkers += 1;
          } else {
            result.movedFiles += 1;
          }
          continue;
        }
        const code = 'statusCode' in error ? String(error.statusCode) : null;
        result.status =
          code === '409'
            ? 'conflict'
            : code === '404'
              ? 'missing'
              : 'uncertain';
      } catch {
        result.status = 'uncertain';
      }
      break;
    }
    if (result.status !== 'moved') stopped = true;
  }
  return results;
}
