import { describe, expect, it } from 'vitest';
import { originalProcessAlive, ownershipState } from './resources-ownership';
import type {
  KernelProcessIdentity,
  ProcessRecord,
  ProcessSnapshot,
} from './resources-process-types';

const context = {
  backend: 'linux-proc-v1',
  host: 'test-host',
  boot: 'test-boot',
  namespace: 'pid:[123]',
} as const;
const start = (birth: string): KernelProcessIdentity => ({ ...context, birth });
const row = (
  pid: number,
  birth: string,
  group = pid,
  zombie = false
): ProcessRecord => ({ pid, identity: start(birth), group, parent: 1, zombie });
const table = (
  ...processes: ProcessRecord[]
): Extract<ProcessSnapshot, { kind: 'ready' }> => ({
  kind: 'ready',
  processes,
  unavailable: [],
  context,
  complete: true,
});
const owner = {
  pid: 101,
  pidStart: start('broker'),
  childPid: 202,
  childStart: start('child'),
};

describe('process start identity ownership', () => {
  it('reclaims a reused broker PID when no original child survives', () => {
    expect(
      ownershipState(
        { pid: 101, pidStart: start('broker') },
        table(row(101, 'replacement'))
      )
    ).toEqual({ kind: 'gone' });
    expect(
      originalProcessAlive(101, start('broker'), table(row(101, 'replacement')))
    ).toBe(false);
  });
  it('does not confuse a replacement child and its new group with the original job', () => {
    expect(
      ownershipState(
        owner,
        table(
          row(101, 'new-broker'),
          row(202, 'new-child'),
          row(303, 'new-descendant', 202)
        )
      )
    ).toEqual({ kind: 'gone' });
  });
  it('keeps an original child after its broker PID is reused', () => {
    expect(
      ownershipState(owner, table(row(101, 'new-broker'), row(202, 'child')))
    ).toEqual({ kind: 'live' });
  });
  it('preserves original descendants after the launcher exits without authorizing them by PGID alone', () => {
    const snapshot = table(row(303, 'original-descendant', 202));
    expect(ownershipState(owner, snapshot).kind).toBe('unknown');
    expect(originalProcessAlive(202, owner.childStart, snapshot)).toBe(false);
    expect(ownershipState(owner, table())).toEqual({ kind: 'gone' });
  });
  it('reserves capacity when process inspection is unavailable', () => {
    expect(
      ownershipState(owner, {
        kind: 'unavailable',
        reason: 'trusted backend unavailable',
      })
    ).toEqual({ kind: 'unknown', reason: 'trusted backend unavailable' });
  });
  it('never adopts an identity for a live legacy PID', () => {
    const snapshot = table(row(101, 'replacement'));
    expect(ownershipState({ pid: 101 }, snapshot).kind).toBe('unknown');
    expect(originalProcessAlive(101, undefined, snapshot)).toBe(false);
    expect(ownershipState({ pid: 404 }, snapshot)).toEqual({ kind: 'gone' });
  });
  it('does not inspect another host or PID namespace as though it were the owner context', () => {
    for (const changed of [
      { host: 'other-host' },
      { namespace: 'other-namespace' },
    ]) {
      expect(
        ownershipState(owner, {
          ...table(),
          context: { ...context, ...changed },
        }).kind
      ).toBe('unknown');
    }
  });
  it('reclaims previous-boot owners only on the same host and namespace', () => {
    expect(
      ownershipState(owner, {
        ...table(),
        context: { ...context, boot: 'next-boot' },
      })
    ).toEqual({ kind: 'gone' });
  });
  it('does not call an incomplete possible original group drained', () => {
    expect(
      ownershipState(owner, {
        ...table(),
        complete: false,
        unavailable: [{ pid: 303, group: 202 }],
      }).kind
    ).toBe('unknown');
    expect(
      ownershipState(owner, {
        ...table(),
        complete: false,
        unavailable: [{ pid: 303 }],
      }).kind
    ).toBe('unknown');
  });
});
