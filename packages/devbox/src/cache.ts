import { createHash } from 'node:crypto';

export type DevboxCacheType =
  | 'bun-install'
  | 'node-modules'
  | 'playwright'
  | 'supabase'
  | 'turbo'
  | 'generic';

export interface DevboxCacheKeyInput {
  bunVersion?: string;
  cacheSchemaVersion: number;
  commandProfile: string;
  envCacheRevision?: string;
  lockfileHash: string;
  nodeVersion?: string;
  platform: string;
  playwrightVersion?: string;
  repoFingerprint: string;
  runtimeImageDigest: string;
  supabaseCliVersion?: string;
}

export interface DevboxCacheRecord {
  bunVersion?: string;
  cacheSchemaVersion: number;
  commandProfile: string;
  key: string;
  lastUsedAt: string;
  lockfileHash?: string;
  sizeBytes: number;
  type: DevboxCacheType;
}

export interface DevboxCacheCompatibility {
  compatible: boolean;
  reason?: string;
}

export function createDevboxCacheKey(input: DevboxCacheKeyInput) {
  const normalized = {
    bunVersion: input.bunVersion ?? null,
    cacheSchemaVersion: input.cacheSchemaVersion,
    commandProfile: input.commandProfile,
    envCacheRevision: input.envCacheRevision ?? null,
    lockfileHash: input.lockfileHash,
    nodeVersion: input.nodeVersion ?? null,
    platform: input.platform,
    playwrightVersion: input.playwrightVersion ?? null,
    repoFingerprint: input.repoFingerprint,
    runtimeImageDigest: input.runtimeImageDigest,
    supabaseCliVersion: input.supabaseCliVersion ?? null,
  };

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 32);
}

export function getCacheCompatibility(
  record: DevboxCacheRecord,
  active: DevboxCacheKeyInput
): DevboxCacheCompatibility {
  if (record.cacheSchemaVersion !== active.cacheSchemaVersion) {
    return { compatible: false, reason: 'cache-schema-mismatch' };
  }

  if (record.commandProfile !== active.commandProfile) {
    return { compatible: false, reason: 'command-profile-mismatch' };
  }

  if (record.lockfileHash && record.lockfileHash !== active.lockfileHash) {
    return { compatible: false, reason: 'lockfile-hash-mismatch' };
  }

  if (
    record.type === 'bun-install' &&
    record.bunVersion &&
    active.bunVersion &&
    record.bunVersion !== active.bunVersion
  ) {
    return { compatible: false, reason: 'bun-version-mismatch' };
  }

  return { compatible: true };
}

function byLastUsedAscending(a: DevboxCacheRecord, b: DevboxCacheRecord) {
  return Date.parse(a.lastUsedAt) - Date.parse(b.lastUsedAt);
}

function byLastUsedDescending(a: DevboxCacheRecord, b: DevboxCacheRecord) {
  return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
}

export function planCacheEvictions(
  records: DevboxCacheRecord[],
  options: {
    activeInput: DevboxCacheKeyInput;
    maxBytes: number;
    protectedRecentCompatibleCount?: number;
  }
) {
  const annotated = records.map((record) => ({
    compatibility: getCacheCompatibility(record, options.activeInput),
    record,
  }));
  const incompatible = annotated
    .filter((entry) => !entry.compatibility.compatible)
    .map((entry) => entry.record)
    .sort(byLastUsedAscending);
  const compatible = annotated
    .filter((entry) => entry.compatibility.compatible)
    .map((entry) => entry.record);
  const protectedCompatible = new Set(
    compatible
      .toSorted(byLastUsedDescending)
      .slice(0, options.protectedRecentCompatibleCount ?? 1)
      .map((entry) => entry.key)
  );

  const evict: DevboxCacheRecord[] = [];
  const keep = new Map(records.map((record) => [record.key, record]));
  let totalBytes = records.reduce((sum, record) => sum + record.sizeBytes, 0);

  for (const record of incompatible) {
    evict.push(record);
    keep.delete(record.key);
    totalBytes -= record.sizeBytes;
  }

  for (const record of compatible.toSorted(byLastUsedAscending)) {
    if (totalBytes <= options.maxBytes) break;
    if (protectedCompatible.has(record.key)) continue;
    evict.push(record);
    keep.delete(record.key);
    totalBytes -= record.sizeBytes;
  }

  return {
    evict,
    keep: [...keep.values()].toSorted(byLastUsedDescending),
    totalBytesAfterEviction: totalBytes,
  };
}
