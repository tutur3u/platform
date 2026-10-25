import { resourceDiskFloorGiB } from './resources-disk-gate';
import type { AutoReclaimOutcome } from './storage-auto-reclaim';
import {
  formatBytes,
  probeVolume,
  type StoragePressure,
  storagePressure,
  type VolumeProbe,
} from './storage-headroom';
import type { Hold } from './storage-holds';
import {
  hostId,
  hysteresisThresholds,
  recordVolumeState,
  storageHome,
} from './storage-hysteresis';
import type { StorageAction } from './storage-suggest';

export interface DiskAdmission {
  pressure: StoragePressure | 'unknown';
  refuse: boolean;
  message: string | null;
}

type Reclaimer = (input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  thresholds: ReturnType<typeof hysteresisThresholds>;
}) => Promise<AutoReclaimOutcome>;

const realReclaim: Reclaimer = async ({ cwd, env, thresholds }) =>
  (await import('./storage-auto-reclaim.js')).autoReclaim({
    trigger: 'admission',
    volumePath: cwd,
    thresholds,
    env,
  });

const realHolds = async (env: NodeJS.ProcessEnv) => {
  const { holdsDirs, readHolds } = await import('./storage-holds.js');
  return readHolds(holdsDirs(env));
};

/**
 * Heavy commands are refused while the volume holding their working directory
 * is `low`: it entered that state below the larger of the admission floor
 * and TTR_STORAGE_MIN_FREE, or an explicit percentage/inode floor. Recovery
 * never falls below admission. On entering or staying
 * low, automatic reclaim runs under this storage authority's cleanup lease;
 * if it cannot recover the volume, the command is refused with the owners of
 * what is left and the resume condition. Alerts print once per storage
 * authority, volume and level. A failed probe is UNKNOWN: it never triggers
 * reclaim and is refused; only an explicit operator override (--ignore-disk
 * or TTR_RESOURCES_IGNORE_DISK=1) admits a command whose headroom could not
 * be measured.
 */
export async function diskAdmission({
  cwd,
  env = process.env,
  probe = probeVolume,
  suggestions = async () =>
    (await import('./storage.js')).readSuggestionCache(storageHome(env)),
  reclaim = realReclaim,
  holds = realHolds,
}: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  probe?: (path: string) => Promise<VolumeProbe>;
  suggestions?: () => Promise<StorageAction[] | null>;
  reclaim?: Reclaimer;
  holds?: (env: NodeJS.ProcessEnv) => Promise<Hold[]>;
}): Promise<DiskAdmission> {
  if (env.TTR_RESOURCES_IGNORE_DISK === '1')
    return { pressure: 'unknown', refuse: false, message: null };
  let volume: VolumeProbe;
  try {
    volume = await probe(cwd);
  } catch (error) {
    return {
      pressure: 'unknown',
      refuse: true,
      message: [
        `refusing a heavy command: disk headroom is UNKNOWN for the volume holding ${cwd} (${error instanceof Error ? error.message : String(error)}).`,
        'Check the path and run ttr storage status; once it reports the volume, re-run the command.',
        'If you have verified free space yourself, override once with --ignore-disk or TTR_RESOURCES_IGNORE_DISK=1; with --offload the command runs on a devbox instead.',
      ].join('\n'),
    };
  }
  let floor: number;
  try {
    floor = resourceDiskFloorGiB(env);
  } catch (error) {
    return {
      pressure: 'unknown',
      refuse: true,
      message:
        error instanceof Error
          ? error.message
          : 'Invalid admission disk floor.',
    };
  }
  const thresholds = hysteresisThresholds({
    ...env,
    TTR_STORAGE_MIN_FREE_PERCENT: env.TTR_STORAGE_MIN_FREE_PERCENT ?? '0',
    TTR_STORAGE_RECOVER_FREE_PERCENT:
      env.TTR_STORAGE_RECOVER_FREE_PERCENT ?? '0',
  });
  thresholds.low.minFreeBytes = Math.max(
    thresholds.low.minFreeBytes,
    floor * 1024 ** 3
  );
  thresholds.recover.minFreeBytes = Math.max(
    thresholds.recover.minFreeBytes,
    thresholds.low.minFreeBytes
  );
  const home = storageHome(env);
  const host = hostId(env);
  const record = (probed: VolumeProbe) =>
    recordVolumeState(probed, thresholds, { home, host });
  let state = record(volume);
  const summary = (probed: VolumeProbe, reasons: string[]) =>
    `${formatBytes(probed.freeBytes)} free (${probed.freePercent.toFixed(1)}%) on the volume holding ${cwd}${reasons.length ? `: ${reasons.join('; ')}` : ''}`;
  const pressureOf = (probed: VolumeProbe) =>
    storagePressure(probed, thresholds.low).pressure;

  if (state.state === 'ok') {
    const pressure = pressureOf(volume);
    if (!state.alert) return { pressure, refuse: false, message: null };
    return {
      pressure,
      refuse: false,
      message:
        state.level === 'warn'
          ? `disk is low, ${summary(volume, storagePressure(volume, thresholds.low).reasons)}. Run ttr storage suggest.`
          : `disk recovered on ${host}: ${summary(volume, [])}.`,
    };
  }

  const outcome = await reclaim({ cwd, env, thresholds }).catch(
    (error: unknown): AutoReclaimOutcome => ({
      result: null,
      note: `reclaim failed to start: ${error instanceof Error ? error.message : String(error)}`,
    })
  );
  const after = outcome.result?.after;
  if (after && after !== volume) {
    volume = after;
    state = record(after);
    if (state.state === 'ok')
      return {
        pressure: pressureOf(after),
        refuse: false,
        message: `disk recovered on ${host} by automatic reclaim (freed ${formatBytes(outcome.result?.freedBytes)}): ${summary(after, [])}.`,
      };
  }
  const [cached, held] = await Promise.all([
    suggestions().catch(() => null),
    holds(env).catch(() => null),
  ]);
  const { blockerReport } = await import('./storage-reclaim-report.js');
  return {
    pressure: 'critical',
    refuse: true,
    message: blockerReport({
      host,
      cwd,
      volume,
      recover: thresholds.recover,
      reasons: state.reasons,
      result: outcome.result,
      note: outcome.note,
      suggestions: cached,
      holds: held,
    }),
  };
}
