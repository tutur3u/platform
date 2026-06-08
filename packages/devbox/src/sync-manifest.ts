import path from 'node:path';

export type SyncEntryStatus = 'added' | 'deleted' | 'modified';

export interface SyncManifestEntry {
  path: string;
  sha256?: string;
  sizeBytes?: number;
  status: SyncEntryStatus;
}

export interface SyncManifest {
  entries: SyncManifestEntry[];
  totalBytes: number;
}

export interface SyncPathValidationOptions {
  allowEnvFiles?: boolean;
}

function hasBlockedSegment(pathname: string) {
  return pathname.split('/').some((segment) => {
    return segment === '.git' || segment === 'node_modules';
  });
}

function isEnvPath(pathname: string) {
  return pathname
    .split('/')
    .some((segment) => segment === '.env' || segment.startsWith('.env.'));
}

export function validateSyncPath(
  value: string,
  options: SyncPathValidationOptions = {}
) {
  const normalizedInput = value.replace(/\\/gu, '/').trim();
  const normalized = path.posix.normalize(normalizedInput);

  if (
    !normalized ||
    normalized === '.' ||
    path.posix.isAbsolute(normalized) ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`Unsafe sync path: ${value}`);
  }

  if (hasBlockedSegment(normalized)) {
    throw new Error(`Blocked sync path: ${value}`);
  }

  if (!options.allowEnvFiles && isEnvPath(normalized)) {
    throw new Error(`Environment files must be passed explicitly: ${value}`);
  }

  return normalized;
}

export function createSyncManifest(
  entries: SyncManifestEntry[],
  options: SyncPathValidationOptions = {}
): SyncManifest {
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      path: validateSyncPath(entry.path, options),
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path));

  return {
    entries: normalizedEntries,
    totalBytes: normalizedEntries.reduce(
      (sum, entry) => sum + (entry.sizeBytes ?? 0),
      0
    ),
  };
}
