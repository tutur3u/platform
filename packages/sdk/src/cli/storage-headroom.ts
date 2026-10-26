// Dependency-free disk headroom primitives shared by `ttr storage`, the
// `ttr resources` disk admission gate, the devbox heartbeat and offload
// selection. Keep this module free of SDK client imports: the resource shims
// load it on every heavy command.
import { stat as statAsync, statfs as statfsAsync } from 'node:fs/promises';

export const GiB = 1024 ** 3;

export interface VolumeProbe {
  path: string;
  device: number | null;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  freePercent: number;
  inodesTotal: number | null;
  inodesFree: number | null;
  inodeFreePercent: number | null;
}

export interface StorageThresholds {
  minFreeBytes: number;
  minFreePercent: number;
  minFreeInodePercent: number;
}

export type StoragePressure = 'ok' | 'low' | 'critical';

export const defaultStorageThresholds: StorageThresholds = {
  minFreeBytes: 15 * GiB,
  minFreePercent: 5,
  minFreeInodePercent: 5,
};

type StatfsLike = (path: string) => Promise<{
  bsize: number | bigint;
  blocks: number | bigint;
  bavail: number | bigint;
  files: number | bigint;
  ffree: number | bigint;
}>;

/**
 * Free space as an unprivileged user sees it (`bavail`, not `bfree`). On APFS
 * every volume in a container shares the container's free space, and inode
 * totals grow on demand, so the inode percentage is informational there.
 */
export async function probeVolume(
  path: string,
  statfs: StatfsLike = statfsAsync,
  stat: (path: string) => Promise<{ dev: number | bigint }> = statAsync
): Promise<VolumeProbe> {
  const info = await statfs(path);
  const bsize = Number(info.bsize);
  const totalBytes = Number(info.blocks) * bsize;
  const freeBytes = Number(info.bavail) * bsize;
  const files = Number(info.files);
  const ffree = Number(info.ffree);
  // btrfs, ZFS and some FUSE mounts report no inode table (files = 0).
  const inodesKnown = Number.isFinite(files) && files > 0;
  let device: number | null = null;
  try {
    device = Number((await stat(path)).dev);
  } catch {
    device = null;
  }
  const probe: VolumeProbe = {
    path,
    device,
    totalBytes,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
    freePercent: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0,
    inodesTotal: inodesKnown ? files : null,
    inodesFree: inodesKnown ? ffree : null,
    inodeFreePercent: inodesKnown ? (ffree / files) * 100 : null,
  };
  // A reading that is not a real volume is UNKNOWN, never "plenty free".
  const finite = [
    bsize,
    probe.totalBytes,
    probe.freeBytes,
    probe.usedBytes,
    probe.freePercent,
    ...(inodesKnown ? [ffree, probe.inodeFreePercent ?? Number.NaN] : []),
  ].every((value) => Number.isFinite(value));
  if (
    !finite ||
    !(probe.totalBytes > 0) ||
    probe.freeBytes < 0 ||
    probe.freeBytes > probe.totalBytes ||
    (inodesKnown && (ffree < 0 || ffree > files))
  )
    throw new Error(
      `unusable volume reading for ${path} (total ${info.blocks} x ${info.bsize}, available ${info.bavail})`
    );
  return probe;
}

const UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  m: 1024 ** 2,
  g: GiB,
  t: 1024 ** 4,
};

/** Parses `15G`, `512MiB`, `2.5gb` or plain bytes. */
export function parseByteSize(value: string) {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^([0-9]+(?:\.[0-9]+)?)\s*([bkmgt])?(?:i?b)?$/u);
  if (!match) throw new Error(`Invalid size: ${value}`);
  const bytes = Math.floor(Number(match[1]) * UNITS[match[2] ?? 'b']!);
  if (!Number.isFinite(bytes) || bytes < 0)
    throw new Error(`Invalid size: ${value}`);
  return bytes;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)}${units[unit]}`;
}

function percent(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new Error(`${name} must be a percentage from 0 to 100.`);
  return parsed;
}

/**
 * Thresholds from the environment. Invalid values fall back to the default
 * with a warning so a typo never bricks every shimmed command.
 */
export function storageThresholds(env: NodeJS.ProcessEnv = process.env): {
  thresholds: StorageThresholds;
  warnings: string[];
} {
  const thresholds = { ...defaultStorageThresholds };
  const warnings: string[] = [];
  const read = (name: string, apply: (value: string) => void) => {
    const value = env[name]?.trim();
    if (!value) return;
    try {
      apply(value);
    } catch (error) {
      warnings.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}; using the default.`
      );
    }
  };
  read('TTR_STORAGE_MIN_FREE', (value) => {
    thresholds.minFreeBytes = parseByteSize(value);
  });
  read('TTR_STORAGE_MIN_FREE_PERCENT', (value) => {
    thresholds.minFreePercent = percent(value, 'TTR_STORAGE_MIN_FREE_PERCENT');
  });
  read('TTR_STORAGE_MIN_FREE_INODE_PERCENT', (value) => {
    thresholds.minFreeInodePercent = percent(
      value,
      'TTR_STORAGE_MIN_FREE_INODE_PERCENT'
    );
  });
  return { thresholds, warnings };
}

/**
 * `critical` when any threshold is crossed, `low` within twice a threshold.
 * Callers refuse heavy work only at `critical`.
 */
export function storagePressure(
  probe: Pick<VolumeProbe, 'freeBytes' | 'freePercent' | 'inodeFreePercent'>,
  thresholds: StorageThresholds = defaultStorageThresholds
): { pressure: StoragePressure; reasons: string[] } {
  const reasons: string[] = [];
  const check = (factor: number) => {
    const found: string[] = [];
    if (probe.freeBytes < thresholds.minFreeBytes * factor)
      found.push(
        `${formatBytes(probe.freeBytes)} free < ${formatBytes(thresholds.minFreeBytes * factor)}`
      );
    if (probe.freePercent < thresholds.minFreePercent * factor)
      found.push(
        `${probe.freePercent.toFixed(1)}% free < ${thresholds.minFreePercent * factor}%`
      );
    if (
      probe.inodeFreePercent != null &&
      probe.inodeFreePercent < thresholds.minFreeInodePercent * factor
    )
      found.push(
        `${probe.inodeFreePercent.toFixed(1)}% inodes free < ${thresholds.minFreeInodePercent * factor}%`
      );
    return found;
  };
  const critical = check(1);
  if (critical.length) return { pressure: 'critical', reasons: critical };
  reasons.push(...check(2));
  return { pressure: reasons.length ? 'low' : 'ok', reasons };
}

// Coarse, monotonic buckets keep the heartbeat a few bytes long and stop free
// space jitter from rewriting the runner row on every beat.
export const DISK_FREE_GIB_BUCKETS = [
  0, 1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000,
] as const;

export function freeGiBBucket(bytes: number) {
  const gib = Math.max(0, bytes) / GiB;
  let bucket = 0;
  for (const step of DISK_FREE_GIB_BUCKETS) if (gib >= step) bucket = step;
  return bucket;
}

export function percentBucket(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.floor(value / 5) * 5));
}

/** Heartbeat payload: lower bounds, so readers can only underestimate. */
export interface DiskCapability {
  freeGiB: number;
  freePct: number;
  inodeFreePct?: number;
}

export function diskCapability(probe: VolumeProbe): DiskCapability {
  return {
    freeGiB: freeGiBBucket(probe.freeBytes),
    freePct: percentBucket(probe.freePercent),
    ...(probe.inodeFreePercent == null
      ? {}
      : { inodeFreePct: percentBucket(probe.inodeFreePercent) }),
  };
}

const isPercentBucket = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 100 &&
  value % 5 === 0;

/**
 * Strict reader for reported capabilities, matching the web and Worker
 * heartbeat schemas: every field is type-checked rather than coerced, so
 * `["50"]` or `"50"` never passes.
 */
export function parseDiskCapability(value: unknown): DiskCapability | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) => !['freeGiB', 'freePct', 'inodeFreePct'].includes(key)
    )
  )
    return null;
  if (
    typeof data.freeGiB !== 'number' ||
    !Number.isInteger(data.freeGiB) ||
    data.freeGiB < 0 ||
    data.freeGiB > 1_000_000
  )
    return null;
  if (!isPercentBucket(data.freePct)) return null;
  if (data.inodeFreePct !== undefined && !isPercentBucket(data.inodeFreePct))
    return null;
  return {
    freeGiB: data.freeGiB,
    freePct: data.freePct,
    ...(data.inodeFreePct === undefined
      ? {}
      : { inodeFreePct: data.inodeFreePct }),
  };
}

export function capabilityPressure(
  capability: DiskCapability,
  thresholds: StorageThresholds = defaultStorageThresholds
) {
  return storagePressure(
    {
      freeBytes: capability.freeGiB * GiB,
      freePercent: capability.freePct,
      inodeFreePercent: capability.inodeFreePct ?? null,
    },
    thresholds
  );
}
