import { statfs } from 'node:fs/promises';

// Minimal disk headroom gate used at dequeue, just before a queued job spawns.
// It mirrors Lane ST's storage thresholds (TTR_STORAGE_MIN_FREE, default
// 15 GiB, and TTR_STORAGE_MIN_FREE_PERCENT, default 5%) without depending on
// the storage-* modules, and unlike an enqueue-time check it fails closed: a
// volume whose free space cannot be read is never admitted.
const GiB = 1024 ** 3;
const units: Record<string, number> = {
  '': 1,
  k: 1024,
  m: 1024 ** 2,
  g: GiB,
  t: 1024 ** 4,
};
function bytes(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback;
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?)i?b?$/iu.exec(value.trim());
  if (!match)
    throw new Error('TTR_STORAGE_MIN_FREE must be a size such as 15g.');
  return Number(match[1]) * units[match[2]!.toLowerCase()]!;
}
function percent(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100)
    throw new Error('TTR_STORAGE_MIN_FREE_PERCENT must be from 0 to 100.');
  return number;
}

export interface DiskProbe {
  freeBytes: number;
  totalBytes: number;
}
export async function probeDisk(path: string): Promise<DiskProbe> {
  const info = await statfs(path);
  const block = Number(info.bsize);
  const freeBytes = Number(info.bavail) * block;
  const totalBytes = Number(info.blocks) * block;
  if (
    !Number.isFinite(freeBytes) ||
    !Number.isFinite(totalBytes) ||
    totalBytes <= 0 ||
    freeBytes < 0
  )
    throw new Error('statfs returned no usable block counts');
  return { freeBytes, totalBytes };
}

// statfs on a hung volume (stale NFS, failing disk) can block indefinitely
// and pin a libuv thread. Bound each probe, and never stack a second probe on
// a path whose previous one is still pending: both count as unknown.
const pending = new Set<string>();
export function probeDiskWithTimeout(
  path: string,
  timeoutMs = 2_000,
  probe: (path: string) => Promise<DiskProbe> = probeDisk
) {
  if (pending.has(path))
    return Promise.reject(
      Object.assign(new Error('probe pending'), { code: 'EBUSY' })
    );
  pending.add(path);
  const running = probe(path).finally(() => pending.delete(path));
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error('probe timed out'), { code: 'ETIMEDOUT' })
        ),
      timeoutMs
    );
    timer.unref?.();
  });
  return Promise.race([running, timeout]).finally(() => clearTimeout(timer));
}
const errnoCode = (error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  return /^E[A-Z0-9]{1,20}$/u.test(code) ? code : 'EUNKNOWN';
};

export type DiskGate =
  | { admit: true; freeGiB: number | undefined }
  | { admit: false; unknown: boolean; reason: string };
export async function diskGate(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  probe: (path: string) => Promise<DiskProbe> = (path) =>
    probeDiskWithTimeout(path)
): Promise<DiskGate> {
  if (env.TTR_RESOURCES_IGNORE_DISK === '1')
    return { admit: true, freeGiB: undefined };
  let minBytes: number;
  let minPercent: number;
  try {
    minBytes = bytes(env.TTR_STORAGE_MIN_FREE, 15 * GiB);
    minPercent = percent(env.TTR_STORAGE_MIN_FREE_PERCENT, 5);
  } catch (error) {
    // Our own fixed messages; they name only the variable, never its value.
    return {
      admit: false,
      unknown: true,
      reason: error instanceof Error ? error.message : 'invalid disk floor',
    };
  }
  // Block reasons reach queue status and logs, so they never include the
  // working path or raw filesystem error text.
  let volume: DiskProbe;
  try {
    volume = await probe(path);
  } catch (error) {
    return {
      admit: false,
      unknown: true,
      reason: `free disk on the job volume is unknown (${errnoCode(error)}), so the job does not start`,
    };
  }
  const freeGiB = volume.freeBytes / GiB;
  const freePercent = (volume.freeBytes / volume.totalBytes) * 100;
  if (volume.freeBytes < minBytes || freePercent < minPercent)
    return {
      admit: false,
      unknown: false,
      reason: `${freeGiB.toFixed(1)} GiB (${freePercent.toFixed(1)}%) free on the job volume is below ${(minBytes / GiB).toFixed(1)} GiB / ${minPercent}%; run ttr storage suggest`,
    };
  return { admit: true, freeGiB };
}
