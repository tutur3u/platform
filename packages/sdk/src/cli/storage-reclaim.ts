import { lstatSync } from 'node:fs';
import {
  formatBytes,
  type StorageThresholds,
  type VolumeProbe,
} from './storage-headroom';
import { type Hold, holdOwners } from './storage-holds';
import { belowRecover, nextVolumeState } from './storage-hysteresis';
import {
  acquireLease,
  defaultLeaseTtlMs,
  type LeaseDeps,
  type LeaseRecord,
} from './storage-lease';
import { checkPathIdle, type IdleLiveness } from './storage-liveness';
import {
  openManifest,
  type ReceiptFs,
  type ReceiptItem,
} from './storage-receipts';
import type { ReclaimCandidate } from './storage-reclaim-plan';
import { killSwitchOn } from './storage-reclaim-switch';
import {
  captureIdentity,
  removeVerifiedTree,
  type TreeIdentity,
} from './storage-safe-remove';

// Automatic reclaim for one storage authority (one OS user's storage home on
// one host). It runs only when a trigger (heavy admission or the devbox
// heartbeat) finds the volume low, under the authority's single cleanup
// lease, and touches only path-bounded candidates the plan allows. For each
// item, in order:
//   1. capture the directory identity (dev/inode chain from the rule root);
//   2. re-check holds, the rule, every process's cwd and open files;
//   3. durably write the intent receipt (fsync);
//   4. inside lease.guard(): re-validate the lease token, fence and expiry
//      under the mutation lock, then remove exactly the verified tree.
// Any failed or erroring step skips the item (fail closed). The run stops at
// the recover thresholds and never widens its scope to close a gap.
// TTR_STORAGE_AUTO_RECLAIM=0 (in the process or the passed env) is a hard
// kill switch checked here, so no caller, `force` or env object bypasses it.

export type ReclaimStatus =
  | 'disabled'
  | 'not-needed'
  | 'recovered'
  | 'insufficient'
  | 'contended'
  | 'lease-lost'
  | 'error';

export interface ReclaimItemResult {
  rule: string;
  path: string;
  owner: string;
  bytes: number;
  status: 'done' | 'failed' | 'skipped';
  reason?: string;
  checks?: string[];
  freedBytes?: number;
}

export interface ReclaimResult {
  status: ReclaimStatus;
  host: string;
  orchestrator: string | null;
  trigger: string;
  before: VolumeProbe | null;
  after: VolumeProbe | null;
  freedBytes: number;
  items: ReclaimItemResult[];
  holder?: LeaseRecord | null;
  fence?: number;
  manifest?: string;
  reason?: string;
}

export interface ReclaimDeps {
  home: string;
  host: string;
  orchestrator: string | null;
  trigger: string;
  probe: () => Promise<VolumeProbe>;
  thresholds: { low: StorageThresholds; recover: StorageThresholds };
  /** Candidates for the low volume (the engine also filters by device). */
  plan: (volume: VolumeProbe) => ReclaimCandidate[];
  holds: () => Hold[];
  liveness: IdleLiveness;
  /** Device of a path (lstat), for the same-volume check. */
  deviceOf?: (path: string) => number;
  /** Extra environment for the kill switch (process.env is always read). */
  env?: NodeJS.ProcessEnv;
  removeTree?: (identity: TreeIdentity) => void;
  receiptFs?: ReceiptFs;
  now?: () => number;
  leaseTtlMs?: number;
  lease?: Omit<LeaseDeps, 'now'>;
}

export { killSwitchOn } from './storage-reclaim-switch';

/** A probe that is not a real volume reading: never act on it. */
const usable = (probe: VolumeProbe | null): probe is VolumeProbe =>
  !!probe &&
  probe.device !== null &&
  Number.isFinite(probe.device) &&
  Number.isFinite(probe.totalBytes) &&
  probe.totalBytes > 0 &&
  Number.isFinite(probe.freeBytes) &&
  probe.freeBytes >= 0 &&
  probe.freeBytes <= probe.totalBytes &&
  Number.isFinite(probe.freePercent);

/** Identity first, then device, holds, rule, cwd and open-file checks. */
function verify(
  candidate: ReclaimCandidate,
  deps: Pick<ReclaimDeps, 'holds' | 'liveness'>,
  device: number
):
  | { ok: true; identity: TreeIdentity; checks: string[] }
  | { ok: false; reason: string } {
  let identity: TreeIdentity;
  try {
    identity = captureIdentity(candidate.root, candidate.path);
  } catch (error) {
    return {
      ok: false,
      reason: `identity check failed: ${(error as Error).message}`,
    };
  }
  // Only space on the low volume counts; another device frees nothing there.
  if (identity.chain.at(-1)?.dev !== device)
    return {
      ok: false,
      reason: `on device ${identity.chain.at(-1)?.dev}, not the low volume (device ${device})`,
    };
  const checks = ['identity', 'same-volume'];
  try {
    const holds = deps.holds();
    for (const path of [candidate.path, ...candidate.scopePaths]) {
      const owners = holdOwners(path, holds);
      if (owners.length)
        return { ok: false, reason: `held by ${owners.join(', ')}` };
    }
    checks.push('holds');
  } catch (error) {
    return {
      ok: false,
      reason: `holds unreadable: ${(error as Error).message}`,
    };
  }
  try {
    const reason = candidate.recheck();
    if (reason) return { ok: false, reason };
    checks.push('rule-recheck');
  } catch (error) {
    return {
      ok: false,
      reason: `re-check failed: ${(error as Error).message}`,
    };
  }
  const idle = checkPathIdle(
    [...new Set([candidate.path, ...candidate.scopePaths])],
    deps.liveness,
    () => candidate.root
  );
  if (!idle.ok) return idle;
  checks.push(...idle.checks);
  return { ok: true, identity, checks };
}

const defaultRemove = (identity: TreeIdentity) => {
  removeVerifiedTree(identity);
};

export async function runReclaim(deps: ReclaimDeps): Promise<ReclaimResult> {
  const now = deps.now ?? Date.now;
  const base = {
    host: deps.host,
    orchestrator: deps.orchestrator,
    trigger: deps.trigger,
    freedBytes: 0,
    items: [] as ReclaimItemResult[],
  };
  if (killSwitchOn(deps.env, deps.home))
    return {
      ...base,
      status: 'disabled',
      before: null,
      after: null,
      reason: 'disabled by TTR_STORAGE_AUTO_RECLAIM=0',
    };
  let taken: ReturnType<typeof acquireLease>;
  try {
    taken = acquireLease({
      home: deps.home,
      host: deps.host,
      trigger: deps.trigger,
      orchestrator: deps.orchestrator,
      ttlMs: deps.leaseTtlMs ?? defaultLeaseTtlMs,
      now,
      ...deps.lease,
    });
  } catch (error) {
    // No lease, no action.
    return {
      ...base,
      status: 'error',
      before: null,
      after: null,
      reason: `cleanup lease unavailable: ${(error as Error).message}`,
    };
  }
  if (!taken.acquired)
    return {
      ...base,
      status: 'contended',
      before: null,
      after: null,
      holder: taken.holder,
      reason: taken.reason,
    };
  const { lease } = taken;
  const fence = lease.record.fence;
  const removeTree = deps.removeTree ?? defaultRemove;
  let before: VolumeProbe | null = null;
  let after: VolumeProbe | null = null;
  let manifest: ReturnType<typeof openManifest> | null = null;
  const stop = (status: ReclaimStatus, reason: string): ReclaimResult => ({
    ...base,
    status,
    before,
    after,
    fence,
    manifest: manifest?.file,
    reason,
  });
  try {
    // Re-measure under the lease: the trigger's reading may be stale.
    const first = await deps.probe();
    if (!usable(first))
      return stop('error', 'unusable volume reading; nothing removed');
    before = first;
    after = before;
    const device = before.device as number;
    if (!belowRecover(before, deps.thresholds.recover))
      return { ...base, status: 'not-needed', before, after, fence };
    let candidates: ReclaimCandidate[];
    const deviceOf = deps.deviceOf ?? ((path: string) => lstatSync(path).dev);
    try {
      candidates = deps.plan(before).filter((candidate) => {
        try {
          return deviceOf(candidate.path) === device;
        } catch {
          return false;
        }
      });
    } catch (error) {
      return stop('error', `planning failed: ${(error as Error).message}`);
    }
    for (const candidate of candidates) {
      if (killSwitchOn(deps.env, deps.home))
        return stop('disabled', 'automatic reclaim kill switch is on');
      if (!lease.renew())
        return stop(
          'lease-lost',
          'the cleanup lease was lost or expired; stopped before the next item'
        );
      const fresh = await deps.probe();
      if (!usable(fresh) || fresh.device !== device)
        return stop('error', 'unusable volume reading; stopped');
      after = fresh;
      if (!belowRecover(after, deps.thresholds.recover)) break;
      const entry: ReclaimItemResult = {
        rule: candidate.rule,
        path: candidate.path,
        owner: candidate.owner,
        bytes: candidate.bytes,
        status: 'skipped',
      };
      base.items.push(entry);
      const verdict = verify(candidate, deps, device);
      if (!verdict.ok) {
        entry.reason = verdict.reason;
        continue;
      }
      const item: ReceiptItem = {
        path: candidate.path,
        rule: candidate.rule,
        owner: candidate.owner,
        bytes: candidate.bytes,
        checks: [...verdict.checks, 'lease-fence', 'kill-switch'],
        evidence: verdict.checks.includes('private-tree')
          ? 'private-tree'
          : 'full-visibility',
      };
      try {
        manifest ??= openManifest(
          deps.home,
          {
            host: deps.host,
            orchestrator: deps.orchestrator,
            trigger: deps.trigger,
            leaseToken: lease.record.token,
            fence,
            pid: lease.record.pid,
          },
          now,
          deps.receiptFs
        );
        manifest.intent(item);
      } catch (error) {
        entry.reason = `durable receipt not written: ${(error as Error).message}`;
        continue;
      }
      entry.checks = item.checks;
      // The destructive boundary: the lease token, fence and expiry are
      // re-validated under the mutation lock, and the removal runs inside it.
      let error: string | undefined;
      let removed = false;
      const guarded = lease.guard(() => {
        // Last look at the kill switch, under the lock, right before acting.
        if (killSwitchOn(deps.env, deps.home)) {
          error = 'automatic reclaim kill switch is on';
          return;
        }
        try {
          removeTree(verdict.identity);
          removed = true;
        } catch (caught) {
          error = (caught as Error).message;
        }
      });
      if (!guarded.ok) {
        entry.reason = guarded.reason;
        try {
          manifest.outcome(item, {
            status: 'not-run',
            freedBytes: 0,
            error: guarded.reason,
          });
        } catch {
          // The intent line already records the attempt.
        }
        return stop('lease-lost', guarded.reason);
      }
      const freed = removed ? candidate.bytes : 0;
      entry.status = removed ? 'done' : 'failed';
      entry.freedBytes = freed;
      if (error) entry.reason = error;
      base.freedBytes += freed;
      try {
        manifest.outcome(item, {
          status: entry.status,
          freedBytes: freed,
          ...(error ? { error } : {}),
        });
      } catch {
        // The intent line already records the attempt.
      }
    }
    const last = await deps.probe();
    if (!usable(last))
      return stop('error', 'unusable volume reading after reclaim');
    after = last;
    const state = nextVolumeState('low', after, deps.thresholds).state;
    return {
      ...base,
      status: state === 'ok' ? 'recovered' : 'insufficient',
      before,
      after,
      fence,
      manifest: manifest?.file,
    };
  } catch (error) {
    return stop('error', (error as Error).message);
  } finally {
    lease.release();
  }
}

export function summarizeReclaim(result: ReclaimResult) {
  const done = result.items.filter((item) => item.status === 'done');
  const parts = [
    `auto-reclaim ${result.status} for this storage authority on ${result.host} (${result.trigger}, ${result.orchestrator ?? 'unidentified caller'}${result.fence ? `, fence ${result.fence}` : ''})`,
  ];
  if (done.length)
    parts.push(
      `freed ${formatBytes(result.freedBytes)} from ${done.length} item(s)`
    );
  if (result.reason) parts.push(result.reason);
  if (result.manifest) parts.push(`receipts: ${result.manifest}`);
  return parts.join('; ');
}
