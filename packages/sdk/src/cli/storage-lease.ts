import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { hostId } from './storage-hysteresis';

// The cleanup lease of one storage authority: one OS user's storage home
// (TTR_STORAGE_HOME, default ~/.tuturuuu/storage) on one host. Every caller
// sharing that home (any orchestrator or project run by the same user)
// shares one lease; another OS user on the same host has a separate home and
// lease, so this is not a host-wide guarantee.
//
// Every lease mutation (acquire, takeover, renew, release) and every guarded
// destructive operation runs under an O_EXCL mutation lock, so they are
// serialized. Each acquisition takes the next number from a durable,
// monotonic fence counter. `guard()` re-reads the lease under the lock and
// runs its operation only if this holder's token and fence are still current
// and unexpired, while still holding the lock: a takeover cannot interleave
// with a removal, and a holder that lost its lease never acts again.

export interface LeaseRecord {
  token: string;
  /** Monotonic fencing number; a takeover always gets a larger one. */
  fence: number;
  pid: number;
  host: string;
  startedAt: string;
  renewedAt: string;
  ttlMs: number;
  trigger: string;
  /** Orchestrator or thread id of the caller (TTR_ORCHESTRATOR_ID). */
  orchestrator: string | null;
}

export type LeaseResult =
  | { acquired: true; lease: Lease }
  | { acquired: false; holder: LeaseRecord | null; reason: string };

export type Guarded<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface Lease {
  record: LeaseRecord;
  /** True while the lease file still names this token and fence. */
  owned: () => boolean;
  /** Extends the lease; false when it was lost, expired or the lock is busy. */
  renew: () => boolean;
  /** Runs `action` only while this lease is provably current (see above). */
  guard: <T>(action: () => T) => Guarded<T>;
  release: () => void;
}

export interface LeaseDeps {
  now?: () => number;
  alive?: (pid: number) => boolean;
  pid?: number;
  /** How long to wait for the mutation lock (default 2s). */
  lockWaitMs?: number;
  /** Test hook: called while the mutation lock is held. */
  inMutation?: (operation: 'acquire' | 'renew' | 'guard' | 'release') => void;
}

export const defaultLeaseTtlMs = 15 * 60_000;
const leaseDir = (home: string, host: string) => join(home, 'reclaim', host);
export const leaseFile = (home: string, host = hostId()) =>
  join(leaseDir(home, host), 'cleanup.lease');
const lockFile = (home: string, host: string) =>
  join(leaseDir(home, host), 'mutation.lock');
const fenceFile = (home: string, host: string) =>
  join(leaseDir(home, host), 'fence');

export const describeHolder = (holder: LeaseRecord) =>
  `cleanup lease of this storage authority held by pid ${holder.pid} on ${holder.host} for ${holder.orchestrator ?? 'an unidentified caller'} since ${holder.startedAt} (${holder.trigger}, fence ${holder.fence})`;

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const sleepSync = (ms: number) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readLease(file: string): LeaseRecord | null {
  const data = readJson<LeaseRecord>(file);
  return data &&
    typeof data.token === 'string' &&
    Number.isSafeInteger(data.fence)
    ? data
    : null;
}

export const readLeaseRecord = (home: string, host = hostId()) =>
  readLease(leaseFile(home, host));

export function leaseExpired(
  record: LeaseRecord,
  now: number,
  alive: (pid: number) => boolean = isAlive,
  host = hostId()
) {
  const renewed = Date.parse(record.renewedAt);
  if (!Number.isFinite(renewed) || now - renewed > record.ttlMs) return true;
  return record.host === host && !alive(record.pid);
}

/** Durable write: temp file, fsync, rename, fsync the directory. */
function writeDurable(file: string, text: string) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
  const dir = openSync(dirname(file), 'r');
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

interface LockRecord {
  token: string;
  pid: number;
  host: string;
  at: string;
}

/**
 * Runs `fn` holding the mutation lock, or returns `locked: false` when the
 * lock stays busy. A lock left by a dead pid on this host is moved aside and
 * removed only if the moved file is the dead holder's; another host's lock
 * is never broken (fail closed).
 */
function withMutation<T>(
  home: string,
  host: string,
  deps: { alive: (pid: number) => boolean; pid: number; lockWaitMs: number },
  fn: () => T
): { locked: true; value: T } | { locked: false } {
  const file = lockFile(home, host);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const mine: LockRecord = {
    token: randomUUID(),
    pid: deps.pid,
    host,
    at: new Date().toISOString(),
  };
  const deadline = Date.now() + deps.lockWaitMs;
  for (;;) {
    const temp = `${file}.${mine.token}.new`;
    let linked = false;
    const fd = openSync(temp, 'wx', 0o600);
    try {
      writeSync(fd, JSON.stringify(mine));
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(temp, file);
      linked = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      rmSync(temp, { force: true });
    }
    if (linked) break;
    const holder = readJson<LockRecord>(file);
    if (holder && holder.host === host && !deps.alive(holder.pid)) {
      const aside = `${file}.dead.${mine.token}`;
      try {
        renameSync(file, aside);
        const moved = readJson<LockRecord>(aside);
        if (moved?.token !== holder.token)
          try {
            // Moved a live holder's fresh lock: put it back.
            linkSync(aside, file);
          } catch {
            // A newer lock exists; nothing to restore.
          }
        rmSync(aside, { force: true });
      } catch {
        // Someone else broke or replaced it first.
      }
      continue;
    }
    if (Date.now() >= deadline) return { locked: false };
    sleepSync(20);
  }
  try {
    return { locked: true, value: fn() };
  } finally {
    if (readJson<LockRecord>(file)?.token === mine.token)
      try {
        unlinkSync(file);
      } catch {
        // Already gone.
      }
  }
}

/** Takes this storage authority's cleanup lease, or reports its holder. */
export function acquireLease({
  home,
  trigger,
  orchestrator = null,
  host = hostId(),
  ttlMs = defaultLeaseTtlMs,
  now = () => Date.now(),
  alive = isAlive,
  pid = process.pid,
  lockWaitMs = 2_000,
  inMutation,
}: {
  home: string;
  trigger: string;
  orchestrator?: string | null;
  host?: string;
  ttlMs?: number;
} & LeaseDeps): LeaseResult {
  const file = leaseFile(home, host);
  const outcome = withMutation(
    home,
    host,
    { alive, pid, lockWaitMs },
    (): LeaseResult => {
      inMutation?.('acquire');
      const holder = readLease(file);
      if (holder && !leaseExpired(holder, now(), alive, host))
        return { acquired: false, holder, reason: describeHolder(holder) };
      const previous = readJson<{ fence?: unknown }>(fenceFile(home, host));
      const last =
        typeof previous?.fence === 'number' &&
        Number.isSafeInteger(previous.fence)
          ? previous.fence
          : 0;
      const fence = Math.max(last, holder?.fence ?? 0) + 1;
      writeDurable(fenceFile(home, host), `${JSON.stringify({ fence })}\n`);
      const stamp = new Date(now()).toISOString();
      const record: LeaseRecord = {
        token: randomUUID(),
        fence,
        pid,
        host,
        startedAt: stamp,
        renewedAt: stamp,
        ttlMs,
        trigger,
        orchestrator,
      };
      writeDurable(file, `${JSON.stringify(record)}\n`);
      return {
        acquired: true,
        lease: handle(home, host, record, {
          now,
          alive,
          pid,
          lockWaitMs,
          inMutation,
        }),
      };
    }
  );
  if (!outcome.locked)
    return {
      acquired: false,
      holder: readLease(file),
      reason:
        'the cleanup lease is being changed by another caller of this storage authority; try again later',
    };
  return outcome.value;
}

function handle(
  home: string,
  host: string,
  record: LeaseRecord,
  deps: {
    now: () => number;
    alive: (pid: number) => boolean;
    pid: number;
    lockWaitMs: number;
    inMutation?: LeaseDeps['inMutation'];
  }
): Lease {
  const file = leaseFile(home, host);
  const lost = (): string | null => {
    const lease = readLease(file);
    if (!lease) return 'the cleanup lease is gone';
    if (lease.token !== record.token || lease.fence !== record.fence)
      return `the cleanup lease was taken over (fence ${lease.fence}, ours ${record.fence})`;
    if (leaseExpired(lease, deps.now(), deps.alive, host))
      return 'the cleanup lease expired';
    return null;
  };
  return {
    record,
    owned: () => {
      const lease = readLease(file);
      return lease?.token === record.token && lease.fence === record.fence;
    },
    renew: () => {
      const outcome = withMutation(home, host, deps, () => {
        deps.inMutation?.('renew');
        if (lost()) return false;
        record.renewedAt = new Date(deps.now()).toISOString();
        writeDurable(file, `${JSON.stringify(record)}\n`);
        return true;
      });
      return outcome.locked && outcome.value;
    },
    guard: <T>(action: () => T): Guarded<T> => {
      const outcome = withMutation(home, host, deps, (): Guarded<T> => {
        deps.inMutation?.('guard');
        const reason = lost();
        if (reason) return { ok: false, reason };
        return { ok: true, value: action() };
      });
      return outcome.locked
        ? outcome.value
        : { ok: false, reason: 'the cleanup lease mutation lock is busy' };
    },
    release: () => {
      withMutation(home, host, deps, () => {
        deps.inMutation?.('release');
        const lease = readLease(file);
        if (lease?.token === record.token && lease.fence === record.fence)
          try {
            unlinkSync(file);
          } catch {
            // Already gone.
          }
      });
    },
  };
}
