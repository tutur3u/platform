import { posix } from 'node:path';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
} from '@tuturuuu/utils/storage-path';
import { isReservedMobileDeploymentDrivePath } from './mobile-deployment/storage-policy';
import { WorkspaceStorageError } from './storage-download-error';
import type { WorkspaceStorageReservedAccessOptions } from './workspace-storage-path-access';

export function normalizeRelativePath(path = '') {
  const sanitizedPath = sanitizePath(path);

  if (sanitizedPath === null) {
    throw new WorkspaceStorageError('Invalid path', 400);
  }

  return sanitizedPath;
}

export function normalizeFilename(filename: string) {
  const sanitizedFilename = sanitizeFilename(filename);

  if (!sanitizedFilename) {
    throw new WorkspaceStorageError('Invalid filename', 400);
  }

  return sanitizedFilename;
}

export function normalizeEntryName(name: string) {
  const sanitizedName = sanitizeFolderName(name);

  if (!sanitizedName) {
    throw new WorkspaceStorageError('Invalid entry name', 400);
  }

  return sanitizedName;
}

export function buildWorkspaceStorageKey(wsId: string, path = '') {
  const normalizedPath = normalizeRelativePath(path);
  return normalizedPath ? posix.join(wsId, normalizedPath) : wsId;
}

export function buildWorkspaceStoragePrefix(wsId: string, path = '') {
  const key = buildWorkspaceStorageKey(wsId, path);
  return key.endsWith('/') ? key : `${key}/`;
}

export function filterReservedWorkspaceStorageObjects<
  T extends { path?: string | null },
>(wsId: string, objects: T[], options?: WorkspaceStorageReservedAccessOptions) {
  if (options?.allowReservedMobileDeploymentVault) {
    return objects;
  }

  return objects.filter(
    (object) =>
      !object.path || !isReservedMobileDeploymentDrivePath(wsId, object.path)
  );
}

export function stripWorkspaceStoragePrefix(wsId: string, fullPath: string) {
  const prefix = `${wsId}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}
