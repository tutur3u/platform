import {
  observeProcess,
  snapshotProcesses,
} from './resources-process-identity';
import {
  identityEqual,
  type KernelProcessIdentity,
  type ProcessSnapshot,
} from './resources-process-types';

export function processInspection() {
  let result: ProcessSnapshot | undefined;
  return () => (result ??= snapshotProcesses());
}

export interface ProcessOwner {
  pid: number;
  childPid?: number;
  pidStart?: KernelProcessIdentity;
  childStart?: KernelProcessIdentity;
}
export type OwnershipState =
  | { kind: 'live' }
  | { kind: 'gone' }
  | { kind: 'unknown'; reason: string };
type ComponentState =
  | { kind: 'live' }
  | { kind: 'gone'; reason: 'absent' | 'reused' | 'rebooted' | 'zombie' }
  | { kind: 'unknown'; reason: string };

function component(
  pid: number,
  expected: KernelProcessIdentity | undefined,
  snapshot: ProcessSnapshot
): ComponentState {
  if (snapshot.kind === 'unavailable')
    return { kind: 'unknown', reason: snapshot.reason };
  const current = snapshot.processes.find((row) => row.pid === pid);
  if (expected) {
    const context = snapshot.context;
    if (
      expected.backend !== context.backend ||
      expected.host !== context.host ||
      expected.namespace !== context.namespace
    )
      return { kind: 'unknown', reason: 'process inspection context changed' };
    if (expected.boot !== context.boot)
      return { kind: 'gone', reason: 'rebooted' };
    if (current && !identityEqual(expected, current.identity))
      return { kind: 'gone', reason: 'reused' };
  }
  if (snapshot.unavailable.some((row) => row.pid === pid))
    return {
      kind: 'unknown',
      reason: 'kernel process identity is unavailable',
    };
  if (!current) return { kind: 'gone', reason: 'absent' };
  if (!expected)
    return {
      kind: 'unknown',
      reason: 'legacy owner has no recorded process start identity',
    };
  return current.zombie ? { kind: 'gone', reason: 'zombie' } : { kind: 'live' };
}

export function originalProcessAlive(
  pid: number,
  expected: KernelProcessIdentity | undefined,
  snapshot = snapshotProcesses()
) {
  return component(pid, expected, snapshot).kind === 'live';
}

export function ownershipState(
  owner: ProcessOwner,
  snapshot?: ProcessSnapshot
): OwnershipState {
  if (!snapshot && owner.pidStart) {
    const current = observeProcess(owner.pid);
    if (
      current.kind === 'present' &&
      !current.process.zombie &&
      identityEqual(owner.pidStart, current.process.identity)
    )
      return { kind: 'live' };
  }
  snapshot ??= snapshotProcesses();
  const broker = component(owner.pid, owner.pidStart, snapshot);
  if (broker.kind === 'live') return broker;
  if (owner.childPid === undefined)
    return broker.kind === 'gone' ? { kind: 'gone' } : broker;
  const child = component(owner.childPid, owner.childStart, snapshot);
  if (child.kind === 'live') return child;
  if (snapshot.kind === 'unavailable')
    return { kind: 'unknown', reason: snapshot.reason };
  // Linux and Darwin reserve a group/session's numeric leader ID while it
  // exists. A verified replacement at that ID proves the original group ended.
  if (
    child.kind === 'gone' &&
    (child.reason === 'reused' || child.reason === 'rebooted')
  )
    return broker.kind === 'gone' ? { kind: 'gone' } : broker;
  const members = snapshot.processes.some(
    (row) => row.group === owner.childPid && !row.zombie
  );
  const unknownMembers = snapshot.unavailable.some(
    (row) => row.group === undefined || row.group === owner.childPid
  );
  if (
    members ||
    unknownMembers ||
    (!snapshot.complete && !snapshot.unavailable.length)
  )
    return {
      kind: 'unknown',
      reason:
        'launcher exited before its original process group was verified drained',
    };
  if (broker.kind === 'unknown') return broker;
  if (child.kind === 'unknown') return child;
  return { kind: 'gone' };
}
