import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import {
  probeVolume,
  type StorageThresholds,
  type VolumeProbe,
} from './storage-headroom';
import { holdsDirs, readHolds } from './storage-holds';
import { hostId, orchestratorId, storageHome } from './storage-hysteresis';
import { leaseExpired, readLeaseRecord } from './storage-lease';
import { realLiveness } from './storage-liveness';
import { measureTrees } from './storage-measure';
import { readLastReclaim, writeLastReclaim } from './storage-receipts';
import { type ReclaimResult, runReclaim } from './storage-reclaim';
import { enabledRules, planReclaim } from './storage-reclaim-plan';
import {
  killSwitchOn,
  autoReclaimEnabled as switchEnabled,
} from './storage-reclaim-switch';
import { ghPullRequests, realGit } from './storage-worktrees';

// Real dependencies for the automatic reclaim engine, plus the event-gated
// debounce shared by its two triggers (heavy admission and the devbox
// heartbeat). There is no timer: a run happens only when a trigger observes
// a low volume, and a run that could not recover the volume is not repeated
// until the cooldown has passed.

export type ReclaimTrigger = 'admission' | 'heartbeat' | 'manual';

/**
 * OFF by default: the triggers run only with TTR_STORAGE_AUTO_RECLAIM=1 or
 * the `<storage home>/auto-reclaim` sentinel set to a true value, and never
 * while the kill switch is on (see storage-reclaim-switch).
 */
export const autoReclaimEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  switchEnabled(env, storageHome(env));

/** Minutes before an unsuccessful run may be retried by a trigger (30). */
export function reclaimCooldownMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.TTR_STORAGE_RECLAIM_COOLDOWN_MINUTES);
  return (Number.isFinite(raw) && raw >= 0 ? raw : 30) * 60_000;
}

/** Idle age for cache and artifact rules (TTR_STORAGE_RECLAIM_OLDER_THAN_DAYS, 7). */
export function reclaimAgeDays(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.TTR_STORAGE_RECLAIM_OLDER_THAN_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? raw : 7;
}

export interface AutoReclaimOutcome {
  result: ReclaimResult | null;
  /** Why no run happened (disabled, cooldown). */
  note: string | null;
}

const UNSUCCESSFUL = new Set(['insufficient', 'error', 'lease-lost']);

export async function autoReclaim({
  trigger,
  volumePath,
  thresholds,
  env = process.env,
  force = false,
  now = Date.now,
}: {
  trigger: ReclaimTrigger;
  volumePath: string;
  thresholds: { low: StorageThresholds; recover: StorageThresholds };
  env?: NodeJS.ProcessEnv;
  force?: boolean;
  now?: () => number;
}): Promise<AutoReclaimOutcome> {
  const home = storageHome(env);
  // A human's `ttr storage reclaim --apply` (force) needs no opt-in and skips
  // the cooldown; the kill switch still stops it.
  if (killSwitchOn(env, home))
    return { result: null, note: 'the automatic reclaim kill switch is on' };
  if (!force && !autoReclaimEnabled(env))
    return {
      result: null,
      note: 'automatic reclaim is off by default; set TTR_STORAGE_AUTO_RECLAIM=1 or write 1 to the auto-reclaim file in the storage home to opt in',
    };
  const host = hostId(env);
  const last = readLastReclaim(home, host);
  const cooldown = reclaimCooldownMs(env);
  if (
    !force &&
    last &&
    UNSUCCESSFUL.has(last.status) &&
    now() - Date.parse(last.at) < cooldown
  )
    return {
      result: null,
      note: `the last run at ${last.at} (${last.trigger}) was ${last.status}; the next automatic attempt is allowed after ${new Date(Date.parse(last.at) + cooldown).toISOString()}`,
    };
  const dirs = holdsDirs(env);
  const olderThanDays = reclaimAgeDays(env);
  const result = await runReclaim({
    home,
    host,
    orchestrator: orchestratorId(env),
    trigger,
    probe: () => probeVolume(volumePath),
    thresholds,
    holds: () => readHolds(dirs),
    liveness: realLiveness,
    env,
    now,
    plan: (volume) =>
      planReclaim({
        device: volume.device,
        holds: () => readHolds(dirs),
        liveness: realLiveness,
        measure: (jobs) => measureTrees(jobs),
        git: realGit,
        prs: ghPullRequests,
        olderThanDays,
        now: now(),
        rules: enabledRules(env),
      }),
  });
  if (result.status !== 'contended' && result.status !== 'disabled')
    writeLastReclaim(home, host, {
      at: new Date(now()).toISOString(),
      trigger,
      orchestrator: result.orchestrator,
      status: result.status,
      freedBytes: result.freedBytes,
      report: result.reason ?? null,
    });
  return { result, note: null };
}

/**
 * Whether a heartbeat that saw a low volume should start a run: enabled, no
 * live lease for this storage authority, and outside the cooldown of an unsuccessful run.
 */
export function heartbeatReclaimDue(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
) {
  if (!autoReclaimEnabled(env)) return false;
  const home = storageHome(env);
  const host = hostId(env);
  const holder = readLeaseRecord(home, host);
  if (holder && !leaseExpired(holder, now, undefined, host)) return false;
  const last = readLastReclaim(home, host);
  return !(
    last &&
    UNSUCCESSFUL.has(last.status) &&
    now - Date.parse(last.at) < reclaimCooldownMs(env)
  );
}

const regularFile = (path: string) => {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * The exact program to re-run this CLI, never resolved through PATH:
 * - a script entry (`node|bun /abs/cli.js`): the absolute runtime plus the
 *   real path of an existing regular script file;
 * - a packaged single executable (argv[1] is virtual or absent): the
 *   absolute executable itself, when it is a regular file named `ttr`.
 * Anything else returns null and nothing is spawned (fail closed).
 */
export function trustedSelfArgv({
  execPath = process.execPath,
  entry = process.argv[1],
  isFile = regularFile,
  resolveReal = (path: string) => realpathSync(path),
}: {
  execPath?: string;
  entry?: string;
  isFile?: (path: string) => boolean;
  resolveReal?: (path: string) => string;
} = {}): string[] | null {
  if (!isAbsolute(execPath)) return null;
  let runtime: string;
  try {
    runtime = resolveReal(execPath);
  } catch {
    return null;
  }
  if (!isFile(runtime)) return null;
  if (entry && isAbsolute(entry) && /\.(c?js|mjs|ts)$/u.test(entry)) {
    let script: string;
    try {
      script = resolveReal(entry);
    } catch {
      return null;
    }
    return isFile(script) ? [runtime, script] : null;
  }
  return /^ttr(\.exe)?$/u.test(basename(runtime)) ? [runtime] : null;
}

/**
 * Heartbeat trigger: starts `ttr storage reclaim --auto` detached so the
 * agent loop never blocks on planning or `lsof`. The child takes the lease
 * itself, so a concurrent admission run makes it report and exit. Returns
 * false (and spawns nothing) when this CLI cannot be re-run by a verified
 * absolute path.
 */
export function spawnHeartbeatReclaim(
  volume: VolumeProbe,
  env: NodeJS.ProcessEnv = process.env,
  {
    argv = trustedSelfArgv(),
    start = spawn,
  }: { argv?: string[] | null; start?: typeof spawn } = {}
) {
  if (!argv) return false;
  const child = start(
    argv[0]!,
    [
      ...argv.slice(1),
      'storage',
      'reclaim',
      '--apply',
      '--auto',
      '--trigger',
      'heartbeat',
      '--path',
      volume.path,
    ],
    { detached: true, stdio: 'ignore', env }
  );
  child.on('error', () => undefined);
  child.unref();
  return true;
}
