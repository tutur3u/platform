import {
  formatBytes,
  probeVolume,
  type StoragePressure,
  storagePressure,
  storageThresholds,
} from './storage-headroom';
import type { StorageAction } from './storage-suggest';

export interface DiskAdmission {
  pressure: StoragePressure | 'unknown';
  refuse: boolean;
  message: string | null;
}

/**
 * Heavy commands are refused when the volume holding their working directory
 * is critical (below TTR_STORAGE_MIN_FREE*, default 15 GiB / 5% / 5% inodes):
 * a build or install that fills the disk breaks every lane on the machine.
 * `low` only warns. A failed probe is UNKNOWN and is refused too: only an
 * explicit operator override (--ignore-disk or TTR_RESOURCES_IGNORE_DISK=1)
 * admits a command whose disk headroom could not be measured.
 */
export async function diskAdmission({
  cwd,
  env = process.env,
  probe = probeVolume,
  suggestions = async () =>
    (await import('./storage.js')).readSuggestionCache(),
}: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  probe?: typeof probeVolume;
  suggestions?: () => Promise<StorageAction[] | null>;
}): Promise<DiskAdmission> {
  if (env.TTR_RESOURCES_IGNORE_DISK === '1')
    return { pressure: 'unknown', refuse: false, message: null };
  let volume: Awaited<ReturnType<typeof probeVolume>>;
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
  const { thresholds } = storageThresholds(env);
  const { pressure, reasons } = storagePressure(volume, thresholds);
  const summary = `${formatBytes(volume.freeBytes)} free (${volume.freePercent.toFixed(1)}%) on the volume holding ${cwd}: ${reasons.join('; ')}`;
  if (pressure === 'ok') return { pressure, refuse: false, message: null };
  if (pressure === 'low')
    return {
      pressure,
      refuse: false,
      message: `disk is low, ${summary}. Run ttr storage suggest.`,
    };
  const cached = await suggestions().catch(() => null);
  const top = (cached ?? [])
    .filter((action) => action.risk !== 'high')
    .slice(0, 3)
    .map(
      (action) =>
        `  ${formatBytes(action.reclaimableBytes).padStart(8)} [${action.risk}] ${action.title}\n           ${action.command}`
    );
  return {
    pressure,
    refuse: true,
    message: [
      `refusing a heavy command: disk is critical, ${summary}.`,
      top.length
        ? `Top cleanup actions (from the last ttr storage suggest):\n${top.join('\n')}`
        : 'Run ttr storage suggest for ranked cleanup actions.',
      'Override once with --ignore-disk or TTR_RESOURCES_IGNORE_DISK=1; with --offload the command runs on a devbox instead.',
    ].join('\n'),
  };
}
