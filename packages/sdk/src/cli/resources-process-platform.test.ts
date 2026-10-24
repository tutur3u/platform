import { describe, expect, it } from 'vitest';
import { ownershipState } from './resources-ownership';
import {
  type DarwinSplitRow,
  observeDarwinProcess,
  parseDarwinProcessBytes,
  parseDarwinSplitRow,
  snapshotDarwinProcesses,
} from './resources-process-darwin';
import {
  observeProcess,
  requireProcessIdentity,
} from './resources-process-identity';
import {
  type LinuxProcessReader,
  observeLinuxProcess,
  parseLinuxStat,
  snapshotLinuxProcesses,
} from './resources-process-linux';
import { identityEqual, type ProcessContext } from './resources-process-types';

function stat(pid: number, birth = '9007199254740993', group = 42) {
  return `${pid} (name ) with\nparentheses)) S 1 ${group} 42 ${Array(15).fill('0').join(' ')} ${birth}`;
}

function failure(code: string): never {
  throw Object.assign(new Error('fixture metadata error'), { code });
}

function linux(
  overrides: Partial<LinuxProcessReader> = {}
): LinuxProcessReader {
  return {
    text: (path) => {
      if (path === '/etc/machine-id')
        return '0123456789abcdef0123456789abcdef\n';
      if (path === '/proc/sys/kernel/random/boot_id')
        return '01234567-89ab-cdef-0123-456789abcdef\n';
      if (path === '/proc/self/stat') return stat(process.pid);
      if (path === '/proc/self/mountinfo')
        return '12 1 0:1 / /proc rw - proc proc rw\n';
      if (path === '/proc/42/stat') return stat(42);
      return failure('ENOENT');
    },
    entries: () => ['self', '42'],
    link: () => 'pid:[4026531836]',
    probe: () => failure('ESRCH'),
    ...overrides,
  };
}

const darwinContext = {
  backend: 'darwin-libproc-v1',
  host: '01234567-89ab-cdef-0123-456789abcdef',
  boot: '11234567-89ab-cdef-0123-456789abcdef',
  namespace: 'darwin-host',
} satisfies ProcessContext;

function darwinBytes(unique = 9007199254740993n, micros = 123456n) {
  const bytes = Buffer.alloc(192);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(42, 12);
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(42, 100);
  bytes.writeBigUInt64LE(1_700_000_000n, 120);
  bytes.writeBigUInt64LE(micros, 128);
  bytes.writeBigUInt64LE(unique, 152);
  return bytes;
}

function darwinOutput(rows: unknown[], complete = true) {
  return JSON.stringify({
    kind: 'ready',
    context: darwinContext,
    rows,
    complete,
  });
}

describe('Linux kernel process identity', () => {
  it('uses the last closing parenthesis and exact field 22 without Number rounding', () => {
    expect(parseLinuxStat(stat(42), 42)).toEqual({
      pid: 42,
      parent: 1,
      group: 42,
      session: 42,
      birth: '9007199254740993',
      zombie: false,
    });
    expect(parseLinuxStat(stat(42).replace(' S ', ' Z '), 42).zombie).toBe(
      true
    );
  });

  it('rejects truncated records, mismatched PIDs and malformed births', () => {
    expect(() => parseLinuxStat('42 (name) S 1 42', 42)).toThrow();
    expect(() => parseLinuxStat(stat(43), 42)).toThrow();
    expect(() => parseLinuxStat(stat(42, '1.5'), 42)).toThrow();
    expect(() => parseLinuxStat(stat(42, '-1'), 42)).toThrow();
    expect(() =>
      parseLinuxStat(stat(42, '18446744073709551616'), 42)
    ).toThrow();
  });

  it('observes the new lifetime after deterministic PID replacement', () => {
    let birth = '9007199254740993';
    const base = linux();
    const reader = linux({
      text: (path) =>
        path === '/proc/42/stat' ? stat(42, birth) : base.text(path),
    });
    const original = observeLinuxProcess(42, reader);
    birth = '9007199254740994';
    const replacement = observeLinuxProcess(42, reader);
    expect(original.kind).toBe('present');
    expect(replacement.kind).toBe('present');
    if (original.kind !== 'present' || replacement.kind !== 'present')
      throw new Error('Expected readable lifetimes');
    expect(
      identityEqual(original.process.identity, replacement.process.identity)
    ).toBe(false);
    expect(original.process.identity.birth).toBe('9007199254740993');
  });

  it('requires ESRCH in addition to missing proc metadata; permission and I/O failures stay unknown', () => {
    const base = linux();
    for (const code of ['EACCES', 'EPERM', 'EIO']) {
      const reader = linux({
        text: (path) =>
          path === '/proc/42/stat' ? failure(code) : base.text(path),
      });
      expect(observeLinuxProcess(42, reader).kind).toBe('unavailable');
    }
    const missing = (probe: LinuxProcessReader['probe']) =>
      linux({
        text: (path) =>
          path === '/proc/42/stat' ? failure('ENOENT') : base.text(path),
        probe,
      });
    expect(
      observeLinuxProcess(
        42,
        missing(() => failure('ESRCH'))
      )
    ).toEqual({ kind: 'gone' });
    expect(
      observeLinuxProcess(
        42,
        missing(() => failure('EPERM'))
      ).kind
    ).toBe('unavailable');
    expect(
      observeLinuxProcess(
        42,
        missing(() => {})
      ).kind
    ).toBe('unavailable');
  });

  it('rejects a missing or mismatched context even when a numeric process exists', () => {
    const base = linux();
    expect(
      observeLinuxProcess(42, linux({ link: () => failure('EACCES') })).kind
    ).toBe('unavailable');
    expect(
      observeLinuxProcess(
        42,
        linux({
          text: (path) =>
            path === '/proc/self/stat'
              ? stat(process.pid + 1)
              : base.text(path),
        })
      ).kind
    ).toBe('unavailable');
    expect(observeLinuxProcess(-42, base).kind).toBe('unavailable');
  });

  it('retains inaccessible rows and known groups without claiming complete inventory', () => {
    const base = linux();
    const snapshot = snapshotLinuxProcesses(
      linux({
        entries: () => ['42', '43', '44', '45'],
        text: (path) => {
          if (path === '/proc/43/stat') return failure('EACCES');
          if (path === '/proc/44/stat') return stat(44, '123', 0);
          return base.text(path);
        },
      })
    );
    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready')
      throw new Error('Expected partial inventory');
    expect(snapshot.processes.map((row) => row.pid)).toEqual([42, 44]);
    expect(snapshot.unavailable).toEqual([{ pid: 43 }]);
    expect(snapshot.complete).toBe(false);
  });

  it('proves owner PID reuse by a group-0 kernel thread instead of retaining it as unknown', () => {
    const base = linux();
    const kernelThread = linux({
      entries: () => ['42'],
      text: (path) =>
        path === '/proc/42/stat'
          ? stat(42, '9007199254740994', 0).replace(' S 1 ', ' I 2 ')
          : base.text(path),
    });
    const observed = observeLinuxProcess(42, kernelThread);
    expect(observed.kind === 'present' && observed.process.group).toBe(0);
    const snapshot = snapshotLinuxProcesses(kernelThread);
    expect(snapshot.kind === 'ready' && snapshot.complete).toBe(true);
    const original = observeLinuxProcess(42, base);
    if (original.kind !== 'present') throw new Error('Expected original');
    const recorded = original.process.identity;
    // Broker-only and child-leader receipts both see a different lifetime.
    expect(ownershipState({ pid: 42, pidStart: recorded }, snapshot)).toEqual({
      kind: 'gone',
    });
    expect(
      ownershipState(
        { pid: 41, pidStart: recorded, childPid: 42, childStart: recorded },
        snapshot
      )
    ).toEqual({ kind: 'gone' });
    // Positive control: the unchanged original lifetime stays live.
    expect(
      ownershipState(
        { pid: 42, pidStart: recorded },
        snapshotLinuxProcesses(linux({ entries: () => ['42'] }))
      )
    ).toEqual({ kind: 'live' });
  });

  it('rejects silently hidden PID inventories and failed enumeration', () => {
    const base = linux();
    for (const option of [
      'hidepid=1',
      'hidepid=2',
      'hidepid=invisible',
      'hidepid=ptraceable',
    ]) {
      expect(
        snapshotLinuxProcesses(
          linux({
            text: (path) =>
              path === '/proc/self/mountinfo'
                ? `12 1 0:1 / /proc rw - proc proc rw,${option}\n`
                : base.text(path),
          })
        ).kind
      ).toBe('unavailable');
    }
    expect(
      snapshotLinuxProcesses(linux({ entries: () => failure('EACCES') })).kind
    ).toBe('unavailable');
    const complete = snapshotLinuxProcesses(base);
    expect(complete.kind === 'ready' && complete.complete).toBe(true);
  });
});

describe('Darwin libproc identity boundary', () => {
  it('keeps unique ID and precise start tuple strings beyond JavaScript integer precision', () => {
    const original = parseDarwinProcessBytes(darwinBytes(), 42, darwinContext);
    const sameSecond = parseDarwinProcessBytes(
      darwinBytes(9007199254740994n, 123457n),
      42,
      darwinContext
    );
    expect(original.identity.birth).toBe('9007199254740993:1700000000:123456');
    expect(identityEqual(original.identity, sameSecond.identity)).toBe(false);
    // Executable UUID and pidversion may change on exec; neither is a lifetime key.
    const afterExec = darwinBytes();
    afterExec.fill(255, 136, 152);
    afterExec.writeInt32LE(123, 168);
    expect(
      parseDarwinProcessBytes(afterExec, 42, darwinContext).identity
    ).toEqual(original.identity);
  });

  it('rejects unsupported sizes, PID mismatch, zero unique ID and invalid microseconds', () => {
    expect(() =>
      parseDarwinProcessBytes(Buffer.alloc(136), 42, darwinContext)
    ).toThrow();
    expect(() =>
      parseDarwinProcessBytes(darwinBytes(), 43, darwinContext)
    ).toThrow();
    expect(() =>
      parseDarwinProcessBytes(darwinBytes(0n), 42, darwinContext)
    ).toThrow();
    expect(() =>
      parseDarwinProcessBytes(darwinBytes(1n, 1000000n), 42, darwinContext)
    ).toThrow();
    const zombie = darwinBytes();
    zombie.writeUInt32LE(5, 4);
    expect(parseDarwinProcessBytes(zombie, 42, darwinContext).zombie).toBe(
      true
    );
  });

  it('accepts only a matching single-PID native result', () => {
    const row = {
      pid: 42,
      kind: 'present',
      bytes: darwinBytes().toString('hex'),
    };
    expect(observeDarwinProcess(42, () => darwinOutput([row])).kind).toBe(
      'present'
    );
    expect(observeDarwinProcess(43, () => darwinOutput([row])).kind).toBe(
      'unavailable'
    );
    expect(observeDarwinProcess(42, () => darwinOutput([row, row])).kind).toBe(
      'unavailable'
    );
    expect(
      observeDarwinProcess(42, () => darwinOutput([{ pid: 42, kind: 'gone' }]))
    ).toEqual({ kind: 'gone' });
    expect(
      observeDarwinProcess(42, () =>
        darwinOutput([{ pid: 42, kind: 'unavailable', group: 42 }])
      ).kind
    ).toBe('unavailable');
  });

  it('fails closed with recovery guidance for absent Python, unsupported ABI and malformed output', () => {
    const absent = observeDarwinProcess(42, () => failure('ENOENT'));
    expect(absent.kind).toBe('unavailable');
    if (absent.kind !== 'unavailable') throw new Error('Expected unavailable');
    expect(absent.reason).toContain('xcode-select --install');
    expect(observeDarwinProcess(42, () => '{broken').kind).toBe('unavailable');
    expect(
      observeDarwinProcess(42, () =>
        JSON.stringify({ kind: 'unavailable', reason: 'ABI mismatch' })
      ).kind
    ).toBe('unavailable');
    const malformed = darwinBytes();
    malformed.writeUInt32LE(43, 12);
    expect(
      observeDarwinProcess(42, () =>
        darwinOutput([
          { pid: 42, kind: 'present', bytes: malformed.toString('hex') },
        ])
      ).kind
    ).toBe('unavailable');
  });

  it('preserves unknown PIDs/groups and the native inventory completeness flag', () => {
    const rows = [
      { pid: 42, kind: 'present', bytes: darwinBytes().toString('hex') },
      { pid: 43, kind: 'unavailable', group: 42 },
      { pid: 44, kind: 'unavailable' },
      { pid: 45, kind: 'gone' },
    ];
    const snapshot = snapshotDarwinProcesses(() => darwinOutput(rows));
    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready')
      throw new Error('Expected partial inventory');
    expect(snapshot.processes.map((row) => row.pid)).toEqual([42]);
    expect(snapshot.unavailable).toEqual([{ pid: 43, group: 42 }, { pid: 44 }]);
    expect(snapshot.complete).toBe(false);
    const incomplete = snapshotDarwinProcesses(() =>
      darwinOutput([rows[0]], false)
    );
    expect(incomplete.kind === 'ready' && incomplete.complete).toBe(false);
    expect(
      snapshotDarwinProcesses(() => darwinOutput([rows[0], rows[0]])).kind
    ).toBe('unavailable');
    const invalidBirth = snapshotDarwinProcesses(() =>
      darwinOutput([
        { pid: 42, kind: 'present', bytes: darwinBytes(0n).toString('hex') },
      ])
    );
    expect(invalidBirth.kind === 'ready' && invalidBirth.unavailable).toEqual([
      { pid: 42, group: 42 },
    ]);
  });
});

function splitRow(overrides: Record<string, unknown> = {}) {
  return {
    pid: 42,
    kind: 'split',
    parent: 1,
    group: 42,
    status: 2,
    unique: '9007199254740993',
    seconds: '1700000000',
    micros: 123456,
    ...overrides,
  };
}

describe('Darwin cross-user identity (flavor 18 denied, flavor 17 readable)', () => {
  it('derives the exact flavor 18 birth so stored receipts compare unchanged', () => {
    const bsd = parseDarwinProcessBytes(darwinBytes(), 42, darwinContext);
    const split = parseDarwinSplitRow(
      splitRow() as unknown as DarwinSplitRow,
      42,
      darwinContext
    );
    expect(split).toEqual(bsd);
    expect(identityEqual(split.identity, bsd.identity)).toBe(true);
    // An exec keeps unique ID and p_start, so the observed lifetime is unchanged.
    const observed = observeDarwinProcess(42, () => darwinOutput([splitRow()]));
    expect(observed).toEqual({ kind: 'present', process: bsd });
    expect(
      ownershipState(
        { pid: 42, pidStart: bsd.identity },
        snapshotDarwinProcesses(() => darwinOutput([splitRow()]))
      )
    ).toEqual({ kind: 'live' });
  });

  it('proves reuse of an owner PID by another user process and completes the inventory', () => {
    const recorded = parseDarwinProcessBytes(
      darwinBytes(),
      42,
      darwinContext
    ).identity;
    const foreign = splitRow({ unique: '570', parent: 1, group: 570 });
    const snapshot = snapshotDarwinProcesses(() => darwinOutput([foreign]));
    expect(snapshot.kind === 'ready' && snapshot.complete).toBe(true);
    expect(ownershipState({ pid: 42, pidStart: recorded }, snapshot)).toEqual({
      kind: 'gone',
    });
    expect(
      ownershipState(
        { pid: 41, pidStart: recorded, childPid: 42, childStart: recorded },
        snapshot
      )
    ).toEqual({ kind: 'gone' });
    const sameSecond = splitRow({ unique: '9007199254740994' });
    expect(
      ownershipState(
        { pid: 42, pidStart: recorded },
        snapshotDarwinProcesses(() => darwinOutput([sameSecond]))
      )
    ).toEqual({ kind: 'gone' });
  });

  it('keeps denied or partial fallback evidence closed', () => {
    const recorded = parseDarwinProcessBytes(
      darwinBytes(),
      42,
      darwinContext
    ).identity;
    // The probe emits a plain unavailable row when the unique-ID bracket,
    // kinfo read or self-consistency check fails.
    const denied = snapshotDarwinProcesses(() =>
      darwinOutput([{ pid: 42, kind: 'unavailable', group: 42 }], false)
    );
    expect(ownershipState({ pid: 42, pidStart: recorded }, denied).kind).toBe(
      'unknown'
    );
    for (const partial of [
      splitRow({ unique: '0' }),
      splitRow({ unique: '09007199254740993' }),
      splitRow({ seconds: '0' }),
      splitRow({ micros: 1_000_000 }),
      splitRow({ group: 0 }),
      splitRow({ status: 6 }),
      splitRow({ seconds: undefined }),
      splitRow({ bytes: darwinBytes().toString('hex') }),
    ]) {
      expect(observeDarwinProcess(42, () => darwinOutput([partial])).kind).toBe(
        'unavailable'
      );
      expect(snapshotDarwinProcesses(() => darwinOutput([partial])).kind).toBe(
        'unavailable'
      );
    }
    // uint64 overflow survives the decimal shape check but never becomes a birth.
    const overflow = splitRow({ unique: '18446744073709551616' });
    expect(observeDarwinProcess(42, () => darwinOutput([overflow])).kind).toBe(
      'unavailable'
    );
    const kept = snapshotDarwinProcesses(() => darwinOutput([overflow]));
    expect(kept.kind === 'ready' && kept.unavailable).toEqual([
      { pid: 42, group: 42 },
    ]);
    expect(ownershipState({ pid: 42, pidStart: recorded }, kept).kind).toBe(
      'unknown'
    );
    expect(
      observeDarwinProcess(42, () => darwinOutput([splitRow({ pid: 43 })])).kind
    ).toBe('unavailable');
  });
});

describe('identity equality and native smoke (root executes)', () => {
  it('compares every identity scope field exactly', () => {
    const identity = { ...darwinContext, birth: '1:1700000000:1' };
    expect(identityEqual(identity, { ...identity })).toBe(true);
    expect(
      identityEqual(identity, { ...identity, backend: 'linux-proc-v1' })
    ).toBe(false);
    for (const field of ['host', 'boot', 'namespace', 'birth'] as const)
      expect(
        identityEqual(identity, { ...identity, [field]: 'different' })
      ).toBe(false);
  });

  it.runIf(process.platform === 'darwin')(
    'reads root-owned launchd identity through the real cross-user path',
    () => {
      const first = observeProcess(1);
      const second = observeProcess(1);
      expect(first.kind).toBe('present');
      if (first.kind !== 'present' || second.kind !== 'present')
        throw new Error('launchd identity unavailable');
      expect(first.process.group).toBe(1);
      expect(
        identityEqual(first.process.identity, second.process.identity)
      ).toBe(true);
    }
  );

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'reads a stable self identity twice through the real backend',
    () => {
      const first = requireProcessIdentity();
      const second = observeProcess(process.pid);
      expect(second.kind).toBe('present');
      if (second.kind !== 'present')
        throw new Error('Self metadata unavailable');
      expect(second.process.pid).toBe(process.pid);
      expect(identityEqual(first, second.process.identity)).toBe(true);
    }
  );
});
