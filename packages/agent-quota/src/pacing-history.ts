import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ObservationSample } from './pacing';
import { assertSafeStateWrite, stateRoot } from './state-root';
import type { AccountUsage } from './types';
import type { ManualUsage } from './usage-import';

const MAX_HISTORY_BYTES = 512_000;
const MAX_SAMPLES_PER_WINDOW = 48;
const HISTORY_RETENTION_MS = 7 * 86_400_000;

export interface PacingHistoryFile {
  version: 1;
  samples: Record<string, Record<string, ObservationSample[]>>;
}

export const pacingHistoryPath = () =>
  stateRoot('.t3', 'caches', 'agent-quota', 'pacing-history.json');

function emptyHistory(): PacingHistoryFile {
  return { version: 1, samples: {} };
}

export async function readPacingHistory(
  path = pacingHistoryPath()
): Promise<PacingHistoryFile> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_HISTORY_BYTES)
        return emptyHistory();
      const parsed = JSON.parse(await file.readFile('utf8')) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        (parsed as PacingHistoryFile).version !== 1 ||
        !(parsed as PacingHistoryFile).samples ||
        typeof (parsed as PacingHistoryFile).samples !== 'object'
      ) {
        return emptyHistory();
      }
      return parsed as PacingHistoryFile;
    } finally {
      await file.close();
    }
  } catch {
    return emptyHistory();
  }
}

export function mergeObservationsIntoHistory(
  history: PacingHistoryFile,
  manualObservations: ManualUsage[] = []
): Record<string, Record<string, ObservationSample[]>> {
  const result: Record<string, Record<string, ObservationSample[]>> = {};
  for (const [instanceId, windows] of Object.entries(history.samples)) {
    result[instanceId] = {};
    for (const [windowId, samples] of Object.entries(windows)) {
      result[instanceId][windowId] = [...samples];
    }
  }
  for (const obs of manualObservations) {
    const usedPercent =
      obs.measure === 'remaining' ? 100 - obs.value : obs.value;
    result[obs.pool] ??= {};
    result[obs.pool]![obs.windowId] ??= [];
    result[obs.pool]![obs.windowId]!.push({
      observedAt: obs.observedAt,
      usedPercent,
      resetsAt: obs.resetAt ?? null,
    });
  }
  return result;
}

export async function appendPacingSnapshots(
  accounts: AccountUsage[],
  now = new Date(),
  path = pacingHistoryPath()
): Promise<void> {
  assertSafeStateWrite(path);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) return;

  const existing = await readPacingHistory(path);
  const cutoffMs = now.getTime() - HISTORY_RETENTION_MS;

  for (const account of accounts) {
    if (!existing.samples[account.instanceId]) {
      existing.samples[account.instanceId] = {};
    }
    const instanceBuckets = existing.samples[account.instanceId]!;
    for (const window of account.windows) {
      if (
        typeof window.usedPercent !== 'number' ||
        !Number.isFinite(window.usedPercent) ||
        !window.observedAt ||
        !Number.isFinite(Date.parse(window.observedAt))
      )
        continue;
      const windowId = window.id ?? window.kind;
      const list = instanceBuckets[windowId] ?? [];
      list.push({
        observedAt: window.observedAt,
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt ?? null,
      });
      const deduped = [
        ...new Map(
          list
            .filter((item) => {
              const ts = Date.parse(item.observedAt);
              return Number.isFinite(ts) && ts >= cutoffMs;
            })
            .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
            .map((item) => [`${item.observedAt}|${item.usedPercent}`, item])
        ).values(),
      ].slice(-MAX_SAMPLES_PER_WINDOW);
      instanceBuckets[windowId] = deduped;
    }
  }

  const content = `${JSON.stringify(existing)}\n`;
  if (Buffer.byteLength(content) > MAX_HISTORY_BYTES) return;
  const temporary = join(directory, `pacing-${randomUUID()}.tmp`);
  try {
    const file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    );
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
