import {
  formatBytes,
  type StorageThresholds,
  type VolumeProbe,
} from './storage-headroom';
import { type Hold, holdOwners } from './storage-holds';
import type { ReclaimResult } from './storage-reclaim';
import type { StorageAction } from './storage-suggest';

// The blocker printed when heavy admission stays closed: what automatic
// reclaim did, the largest things a human could still reclaim and who owns
// them, and the exact condition under which admission resumes.

export interface BlockerInput {
  host: string;
  cwd: string;
  volume: VolumeProbe;
  recover: StorageThresholds;
  reasons: string[];
  result: ReclaimResult | null;
  /** Why no reclaim ran this time (disabled, cooldown, contended...). */
  note?: string | null;
  suggestions: StorageAction[] | null;
  holds: Hold[] | null;
  limit?: number;
}

const owned = (path: string, holds: Hold[] | null) => {
  if (!path) return 'machine user';
  if (!holds) return 'unknown (holds unreadable)';
  const owners = holdOwners(path, holds);
  return owners.length
    ? `held by ${owners.join(', ')}; ask that owner to release it`
    : 'no hold; machine user';
};

export function blockerReport(input: BlockerInput) {
  const limit = input.limit ?? 5;
  const { volume, recover } = input;
  const needBytes = Math.max(0, recover.minFreeBytes - volume.freeBytes);
  const needPercentBytes = Math.max(
    0,
    Math.ceil(
      (recover.minFreePercent / 100) * volume.totalBytes - volume.freeBytes
    )
  );
  const lines = [
    `refusing a heavy command on ${input.host}: ${formatBytes(volume.freeBytes)} free (${volume.freePercent.toFixed(1)}%) on the volume holding ${input.cwd}: ${input.reasons.join('; ')}.`,
  ];
  const result = input.result;
  if (result) {
    const done = result.items.filter((item) => item.status === 'done');
    lines.push(
      `Automatic reclaim (${result.trigger}, lease of this storage authority ${result.status === 'contended' ? 'held by another caller' : 'taken'}): ${result.status}${done.length ? `, freed ${formatBytes(result.freedBytes)} from ${done.length} item(s)` : ', nothing removed'}${result.reason ? ` — ${result.reason}` : ''}.`
    );
    if (result.manifest) lines.push(`Receipts: ${result.manifest}`);
    const skipped = result.items
      .filter((item) => item.status !== 'done')
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, limit);
    if (skipped.length)
      lines.push(
        'Eligible items automatic reclaim did not remove:',
        ...skipped.map(
          (item) =>
            `  ${formatBytes(item.bytes).padStart(8)} ${item.path}\n           owner: ${item.owner}; ${item.status}: ${item.reason ?? 'unknown'}`
        )
      );
  } else if (input.note) {
    lines.push(`Automatic reclaim not run: ${input.note}.`);
  }
  const manual = (input.suggestions ?? [])
    .filter((action) => action.risk !== 'high')
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)
    .slice(0, limit);
  const high = (input.suggestions ?? []).filter(
    (action) => action.risk === 'high'
  ).length;
  if (manual.length)
    lines.push(
      'Largest manual reclaim candidates (last ttr storage suggest; a human decides):',
      ...manual.map(
        (action) =>
          `  ${formatBytes(action.reclaimableBytes).padStart(8)} [${action.risk}] ${action.title}${action.path ? ` ${action.path}` : ''}\n           owner: ${owned(action.path, input.holds)}\n           ${action.command}`
      )
    );
  else
    lines.push(
      'No fresh ttr storage suggest results: run ttr storage suggest for ranked manual actions and owners.'
    );
  if (high)
    lines.push(
      `${high} high-risk item(s) omitted; review them with ttr storage suggest.`
    );
  lines.push(
    `Resume: heavy admission reopens once this volume has at least ${formatBytes(recover.minFreeBytes)} and ${recover.minFreePercent}% free${volume.inodeFreePercent == null ? '' : ` with ${recover.minFreeInodePercent}% inodes free`}${needBytes || needPercentBytes ? ` (about ${formatBytes(Math.max(needBytes, needPercentBytes))} more)` : ''}; re-run the command after space is released. Override once with --ignore-disk or TTR_RESOURCES_IGNORE_DISK=1; with --offload the command runs on a devbox instead.`
  );
  return lines.join('\n');
}
