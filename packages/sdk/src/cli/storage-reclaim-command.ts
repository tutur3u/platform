import { autoReclaim, reclaimAgeDays } from './storage-auto-reclaim';
import { formatBytes, probeVolume } from './storage-headroom';
import { holdsDirs, readHolds } from './storage-holds';
import {
  hostId,
  hysteresisThresholds,
  nextVolumeState,
  recordVolumeState,
  storageHome,
} from './storage-hysteresis';
import { readLeaseRecord } from './storage-lease';
import { realLiveness } from './storage-liveness';
import { measureTrees } from './storage-measure';
import { readLastReclaim } from './storage-receipts';
import { summarizeReclaim } from './storage-reclaim';
import { enabledRules, planReclaim } from './storage-reclaim-plan';
import { blockerReport } from './storage-reclaim-report';
import { ghPullRequests, realGit } from './storage-worktrees';

interface ReclaimOptions {
  json: boolean;
  apply: boolean;
  auto: boolean;
  trigger: string | null;
  paths: string[];
  holdsDirs: string[];
  offline: boolean;
  docker: boolean;
}

/**
 * `ttr storage reclaim`: without --apply, the plan automatic reclaim would
 * try for this storage authority (this OS user on this host) and the current
 * lease and last run; with --apply, one run under its lease. `--auto --trigger heartbeat` is how the devbox
 * heartbeat starts it (cooldown and TTR_STORAGE_AUTO_RECLAIM apply).
 */
export async function runReclaimCommand(options: ReclaimOptions) {
  const env = options.holdsDirs.length
    ? {
        ...process.env,
        TTR_STORAGE_HOLDS_DIRS: [
          ...new Set([
            ...(process.env.TTR_STORAGE_HOLDS_DIRS?.split(':').filter(
              Boolean
            ) ?? []),
            ...options.holdsDirs,
          ]),
        ].join(':'),
      }
    : process.env;
  const thresholds = hysteresisThresholds(env);
  for (const warning of thresholds.warnings)
    process.stderr.write(`[ttr storage] ${warning}\n`);
  const volumePath = options.paths[0] ?? process.cwd();
  const home = storageHome(env);
  const host = hostId(env);
  const write = (value: unknown, text: string) =>
    process.stdout.write(
      options.json ? `${JSON.stringify(value, null, 2)}\n` : `${text}\n`
    );

  if (options.apply) {
    const trigger = options.auto
      ? options.trigger === 'heartbeat'
        ? 'heartbeat'
        : 'admission'
      : 'manual';
    const outcome = await autoReclaim({
      trigger,
      volumePath,
      thresholds,
      env,
      force: !options.auto,
    });
    if (outcome.result?.after)
      recordVolumeState(outcome.result.after, thresholds, { home, host });
    const blocked =
      outcome.result?.after &&
      nextVolumeState('low', outcome.result.after, thresholds).state === 'low';
    const text = outcome.result
      ? [
          summarizeReclaim(outcome.result),
          ...outcome.result.items.map(
            (item) =>
              `  ${item.status.padEnd(7)} ${formatBytes(item.freedBytes ?? item.bytes).padStart(8)} [${item.rule}] ${item.path}\n            owner: ${item.owner}${item.reason ? `; ${item.reason}` : ''}`
          ),
          ...(blocked && outcome.result.after
            ? [
                '',
                blockerReport({
                  host,
                  cwd: volumePath,
                  volume: outcome.result.after,
                  recover: thresholds.recover,
                  reasons: nextVolumeState(
                    'low',
                    outcome.result.after,
                    thresholds
                  ).reasons,
                  result: outcome.result,
                  suggestions: null,
                  holds: safeHolds(env),
                }),
              ]
            : []),
        ].join('\n')
      : `auto-reclaim not run: ${outcome.note}`;
    write(outcome, text);
    if (
      outcome.result &&
      ['error', 'lease-lost'].includes(outcome.result.status)
    )
      process.exitCode = 1;
    else if (blocked || outcome.result?.status === 'contended')
      process.exitCode = 2;
    return;
  }

  const volume = await probeVolume(volumePath);
  const state = nextVolumeState('low', volume, thresholds);
  const dirs = holdsDirs(env);
  const candidates = planReclaim({
    holds: () => readHolds(dirs),
    liveness: realLiveness,
    measure: (jobs) => measureTrees(jobs),
    git: realGit,
    prs: options.offline ? () => null : ghPullRequests,
    olderThanDays: reclaimAgeDays(env),
    now: Date.now(),
    rules: enabledRules(env),
  });
  const lease = readLeaseRecord(home, host);
  const last = readLastReclaim(home, host);
  const value = { host, volume, thresholds, candidates, lease, last };
  write(
    value,
    [
      `Host ${host}: ${formatBytes(volume.freeBytes)} free (${volume.freePercent.toFixed(1)}%) on ${volumePath}; ${state.state === 'ok' ? 'at or above the recover thresholds' : `below recover: ${state.reasons.join('; ')}`}.`,
      `Recover at ${formatBytes(thresholds.recover.minFreeBytes)} and ${thresholds.recover.minFreePercent}% free; low below ${formatBytes(thresholds.low.minFreeBytes)} or ${thresholds.low.minFreePercent}%.`,
      lease
        ? `Cleanup lease: pid ${lease.pid} for ${lease.orchestrator ?? 'an unidentified caller'} since ${lease.startedAt} (${lease.trigger}).`
        : 'Cleanup lease: free.',
      last
        ? `Last run: ${last.status} at ${last.at} (${last.trigger}), freed ${formatBytes(last.freedBytes)}.`
        : 'Last run: none recorded.',
      candidates.length
        ? 'Eligible in order (each is re-checked for holds, processes and open files right before removal):'
        : 'No eligible automatic reclaim for this storage authority.',
      ...candidates.map(
        (candidate) =>
          `  ${formatBytes(candidate.bytes).padStart(8)} [${candidate.rule}] ${candidate.path}\n           owner: ${candidate.owner}`
      ),
      '',
      "Nothing was removed. --apply runs one reclaim under this storage authority's lease and stops at the recover thresholds.",
    ].join('\n')
  );
}

function safeHolds(env: NodeJS.ProcessEnv) {
  try {
    return readHolds(holdsDirs(env));
  } catch {
    return null;
  }
}
