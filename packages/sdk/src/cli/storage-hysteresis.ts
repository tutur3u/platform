import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  formatBytes,
  parseByteSize,
  type StorageThresholds,
  storageThresholds,
  type VolumeProbe,
} from './storage-headroom';

// Hysteresis: a volume enters `low` below the low thresholds
// (TTR_STORAGE_MIN_FREE*) and leaves it only at or above the separate recover
// thresholds (TTR_STORAGE_RECOVER_FREE*). Between the two it keeps its state,
// so admission does not flap around one number.

export type VolumeState = 'ok' | 'low';
/** What an operator was last told: `warn` is ok but below recover. */
export type AlertLevel = VolumeState | 'warn';

/**
 * The storage authority: one OS user's storage home on one host, holding the
 * pressure state, cleanup lease and receipts. It is not per project or
 * checkout (every orchestrator this user runs, Tuturuuu, Upskii or
 * Mastermind, shares it), but it is also not host-wide: another OS user on
 * the same host has its own home, lease and receipts.
 */
export const storageHome = (env: NodeJS.ProcessEnv = process.env) =>
  resolve(env.TTR_STORAGE_HOME || join(homedir(), '.tuturuuu', 'storage'));

/** Host identity keying this user's lease and receipts (override for renamed hosts). */
export const hostId = (env: NodeJS.ProcessEnv = process.env) =>
  (env.TTR_STORAGE_HOST_ID?.trim() || hostname()).replace(/[^\w.-]+/gu, '_');

/** The caller's orchestrator or thread id, recorded in leases and receipts. */
export const orchestratorId = (env: NodeJS.ProcessEnv = process.env) =>
  env.TTR_ORCHESTRATOR_ID?.trim() || env.T3_THREAD_ID?.trim() || null;

/** Documented defaults: recover at twice each low threshold. */
export function recoverThresholds(
  low: StorageThresholds,
  env: NodeJS.ProcessEnv = process.env
): { thresholds: StorageThresholds; warnings: string[] } {
  const thresholds = {
    minFreeBytes: low.minFreeBytes * 2,
    minFreePercent: Math.min(100, low.minFreePercent * 2),
    minFreeInodePercent: Math.min(100, low.minFreeInodePercent * 2),
  };
  const warnings: string[] = [];
  const read = (name: string, apply: (value: string) => void) => {
    const value = env[name]?.trim();
    if (!value) return;
    try {
      apply(value);
    } catch (error) {
      warnings.push(`${name}: ${(error as Error).message}; using the default.`);
    }
  };
  const percent = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
      throw new Error('must be a percentage from 0 to 100');
    return parsed;
  };
  read('TTR_STORAGE_RECOVER_FREE', (value) => {
    thresholds.minFreeBytes = parseByteSize(value);
  });
  read('TTR_STORAGE_RECOVER_FREE_PERCENT', (value) => {
    thresholds.minFreePercent = percent(value);
  });
  read('TTR_STORAGE_RECOVER_FREE_INODE_PERCENT', (value) => {
    thresholds.minFreeInodePercent = percent(value);
  });
  // Recover can never sit below low, or the state could not settle.
  thresholds.minFreeBytes = Math.max(thresholds.minFreeBytes, low.minFreeBytes);
  thresholds.minFreePercent = Math.max(
    thresholds.minFreePercent,
    low.minFreePercent
  );
  thresholds.minFreeInodePercent = Math.max(
    thresholds.minFreeInodePercent,
    low.minFreeInodePercent
  );
  return { thresholds, warnings };
}

export function hysteresisThresholds(env: NodeJS.ProcessEnv = process.env) {
  const low = storageThresholds(env);
  const recover = recoverThresholds(low.thresholds, env);
  return {
    low: low.thresholds,
    recover: recover.thresholds,
    warnings: [...low.warnings, ...recover.warnings],
  };
}

type Probe = Pick<
  VolumeProbe,
  'freeBytes' | 'freePercent' | 'inodeFreePercent'
>;

function below(probe: Probe, thresholds: StorageThresholds) {
  const reasons: string[] = [];
  if (probe.freeBytes < thresholds.minFreeBytes)
    reasons.push(
      `${formatBytes(probe.freeBytes)} free < ${formatBytes(thresholds.minFreeBytes)}`
    );
  if (probe.freePercent < thresholds.minFreePercent)
    reasons.push(
      `${probe.freePercent.toFixed(1)}% free < ${thresholds.minFreePercent}%`
    );
  if (
    probe.inodeFreePercent != null &&
    probe.inodeFreePercent < thresholds.minFreeInodePercent
  )
    reasons.push(
      `${probe.inodeFreePercent.toFixed(1)}% inodes free < ${thresholds.minFreeInodePercent}%`
    );
  return reasons;
}

/** Pure transition: `previous` decides the band between low and recover. */
export function nextVolumeState(
  previous: VolumeState,
  probe: Probe,
  thresholds: { low: StorageThresholds; recover: StorageThresholds }
): { state: VolumeState; reasons: string[] } {
  const low = below(probe, thresholds.low);
  if (low.length) return { state: 'low', reasons: low };
  const recover = below(probe, thresholds.recover);
  if (previous === 'low' && recover.length)
    return {
      state: 'low',
      reasons: recover.map((reason) => `not yet recovered: ${reason}`),
    };
  return { state: 'ok', reasons: [] };
}

export function belowRecover(probe: Probe, recover: StorageThresholds) {
  return below(probe, recover).length > 0;
}

interface VolumeRecord {
  state: VolumeState;
  since: string;
  /** The level an alert was last printed for (dedupe per authority, volume and level). */
  alerted: AlertLevel | null;
}
interface StateFile {
  host: string;
  volumes: Record<string, VolumeRecord>;
}

const stateFile = (home: string) => join(home, 'pressure-state.json');

function readState(home: string): StateFile {
  try {
    const data = JSON.parse(readFileSync(stateFile(home), 'utf8')) as StateFile;
    if (data && typeof data === 'object' && data.volumes) return data;
  } catch {
    // Missing or unreadable state starts fresh (every volume `ok`).
  }
  return { host: hostname(), volumes: {} };
}

function writeState(home: string, data: StateFile) {
  const file = stateFile(home);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

export const volumeKey = (
  probe: Pick<VolumeProbe, 'device' | 'path'>,
  host = hostId()
) => `${host}:${probe.device ?? probe.path}`;

/**
 * Records a fresh measurement and returns the new state, whether it changed,
 * and whether an alert should print (once per storage authority, volume and level).
 */
export function recordVolumeState(
  probe: VolumeProbe,
  thresholds: { low: StorageThresholds; recover: StorageThresholds },
  {
    home = storageHome(),
    host = hostId(),
    now = Date.now(),
  }: { home?: string; host?: string; now?: number } = {}
) {
  const data = readState(home);
  data.host = host;
  const key = volumeKey(probe, host);
  const previous = data.volumes[key];
  const next = nextVolumeState(previous?.state ?? 'ok', probe, thresholds);
  const changed = next.state !== (previous?.state ?? 'ok');
  const level: AlertLevel =
    next.state === 'low'
      ? 'low'
      : belowRecover(probe, thresholds.recover)
        ? 'warn'
        : 'ok';
  // One alert per level change: entering warn or low, and recovering once.
  const alert = (previous?.alerted ?? 'ok') !== level;
  data.volumes[key] = {
    state: next.state,
    since: changed || !previous ? new Date(now).toISOString() : previous.since,
    alerted: level,
  };
  try {
    writeState(home, data);
  } catch {
    // A read-only home must not block admission; alerts just repeat.
  }
  return { ...next, level, changed, alert, previous: previous?.state ?? 'ok' };
}
