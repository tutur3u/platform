import { describe, expect, it } from 'vitest';
import {
  type FenceMode,
  type FenceOperation,
  type FenceSnapshot,
  fenceDecision,
  modeAllows,
  parseFenceFloor,
  stricterMode,
} from './fence';

const NOW = 1_800_000_000_000;
const snap = (
  mode: FenceMode,
  over: Partial<FenceSnapshot> = {}
): FenceSnapshot => ({ mode, version: 4, readAtMs: NOW - 1_000, ...over });

const decide = (
  operation: FenceOperation,
  snapshot: FenceSnapshot | null,
  floor: FenceMode = 'running',
  nowMs = NOW
) => fenceDecision({ operation, snapshot, floor, nowMs });

const census: FenceOperation = {
  kind: 'background',
  work: 'census',
  category: 'keys',
};

/** The table, row by row, as [operation, running, issuance_stopped, stopped]. */
const TABLE: Array<[string, FenceOperation, boolean, boolean, boolean]> = [
  ['resolve', { kind: 'resolve' }, true, true, false],
  ['liveness', { kind: 'liveness' }, true, true, false],
  ['session issue', { kind: 'session_issue' }, true, false, false],
  ['credential mint', { kind: 'credential_mint' }, true, false, false],
  ['s2s mint', { kind: 's2s_mint' }, true, false, false],
  [
    'step-up revoke_all',
    { kind: 'step_up', act: 'sessions.revoke_all' },
    true,
    true,
    false,
  ],
  [
    'step-up other act',
    { kind: 'step_up', act: 'vault.pin-eval' },
    true,
    false,
    false,
  ],
  [
    'record_factors password',
    { kind: 'record_factors', act: 'account.password' },
    true,
    true,
    false,
  ],
  [
    'record_factors mfa',
    { kind: 'record_factors', act: 'account.mfa.enroll' },
    true,
    false,
    false,
  ],
  ['logout own', { kind: 'logout_own' }, true, true, true],
  ['revoke user path', { kind: 'revoke_user' }, true, true, false],
  ['revoke admin path', { kind: 'revoke_admin' }, true, true, true],
  ['security cleanup', { kind: 'security_cleanup' }, true, true, true],
  ['background', census, true, false, false],
];

describe('modeAllows', () => {
  it.each(TABLE)('%s', (_, operation, running, issuanceStopped, stopped) => {
    expect(modeAllows('running', operation)).toBe(running);
    expect(modeAllows('issuance_stopped', operation)).toBe(issuanceStopped);
    expect(modeAllows('stopped', operation)).toBe(stopped);
  });
});

describe('floor', () => {
  it('reads unset as running and a typo as stopped', () => {
    expect(parseFenceFloor(undefined)).toBe('running');
    expect(parseFenceFloor('  ')).toBe('running');
    expect(parseFenceFloor('issuance_stopped')).toBe('issuance_stopped');
    expect(parseFenceFloor('stoped')).toBe('stopped');
  });

  it('takes the stricter mode', () => {
    expect(stricterMode('running', 'issuance_stopped')).toBe(
      'issuance_stopped'
    );
    expect(stricterMode('stopped', 'issuance_stopped')).toBe('stopped');
  });

  it('applies the floor over a running snapshot to issuance and resolution', () => {
    expect(
      decide({ kind: 'session_issue' }, snap('running'), 'issuance_stopped')
    ).toMatchObject({
      allowed: false,
      reason: 'forbidden',
      mode: 'issuance_stopped',
    });
    expect(
      decide({ kind: 'resolve' }, snap('running'), 'stopped')
    ).toMatchObject({
      allowed: false,
      reason: 'forbidden',
      mode: 'stopped',
    });
  });

  it('never loosens a stricter snapshot', () => {
    expect(
      decide({ kind: 'resolve' }, snap('stopped'), 'running')
    ).toMatchObject({
      allowed: false,
      mode: 'stopped',
    });
  });

  it('applies the floor to resolution with a stale snapshot inside the fuse', () => {
    const stale = snap('running', { readAtMs: NOW - 120_000 });
    expect(decide({ kind: 'resolve' }, stale)).toMatchObject({ allowed: true });
    expect(decide({ kind: 'resolve' }, stale, 'stopped')).toMatchObject({
      allowed: false,
      reason: 'forbidden',
    });
  });
});

describe('fenceDecision snapshot age', () => {
  it('refuses issuance with a snapshot older than 10 seconds or none', () => {
    const op: FenceOperation = { kind: 'credential_mint' };
    expect(
      decide(op, snap('running', { readAtMs: NOW - 10_000 }))
    ).toMatchObject({
      allowed: true,
      version: 4,
    });
    expect(
      decide(op, snap('running', { readAtMs: NOW - 10_001 }))
    ).toMatchObject({
      allowed: false,
      reason: 'stale',
    });
    expect(decide(op, null)).toMatchObject({ allowed: false, reason: 'stale' });
  });

  it('answers unavailable for resolution 5 minutes after readAtMs, or with no snapshot', () => {
    const op: FenceOperation = { kind: 'resolve' };
    expect(
      decide(op, snap('running', { readAtMs: NOW - 300_000 })).allowed
    ).toBe(true);
    expect(
      decide(op, snap('running', { readAtMs: NOW - 300_001 }))
    ).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
    expect(decide(op, null)).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
    expect(decide({ kind: 'liveness' }, null)).toMatchObject({
      reason: 'unavailable',
    });
  });

  it('answers unavailable past the fuse even with a floor deployed', () => {
    expect(
      decide(
        { kind: 'resolve' },
        snap('running', { readAtMs: NOW - 400_000 }),
        'issuance_stopped'
      )
    ).toMatchObject({ allowed: false, reason: 'unavailable' });
  });

  it('ignores a snapshot more than 5 seconds ahead of the clock', () => {
    const ahead = snap('running', { readAtMs: NOW + 5_001 });
    expect(decide({ kind: 'session_issue' }, ahead)).toMatchObject({
      reason: 'stale',
    });
    expect(
      decide(
        { kind: 'session_issue' },
        snap('running', { readAtMs: NOW + 5_000 })
      ).allowed
    ).toBe(true);
  });

  it('runs logout, admin revoke and security cleanup with no snapshot, even with a stopped floor', () => {
    for (const kind of [
      'logout_own',
      'revoke_admin',
      'security_cleanup',
    ] as const) {
      expect(decide({ kind }, null, 'stopped')).toMatchObject({
        allowed: true,
      });
    }
    expect(decide({ kind: 'revoke_user' }, null, 'stopped')).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
  });
});

describe('user-path revoke', () => {
  const op: FenceOperation = { kind: 'revoke_user' };

  it('answers unavailable with no snapshot under the running floor', () => {
    expect(decide(op, null, 'running')).toEqual({
      allowed: false,
      reason: 'unavailable',
      mode: null,
      version: null,
    });
  });

  it('answers unavailable for a running snapshot past the 5-minute fuse', () => {
    expect(
      decide(op, snap('running', { readAtMs: NOW - 300_001 }))
    ).toMatchObject({ allowed: false, reason: 'unavailable' });
  });

  it('answers unavailable for an unusable snapshot', () => {
    expect(
      decide(op, snap('running', { readAtMs: NOW + 5_001 }))
    ).toMatchObject({ allowed: false, reason: 'unavailable', mode: null });
    expect(
      decide(op, { mode: 'paused', version: 4, readAtMs: NOW } as never)
    ).toMatchObject({ allowed: false, reason: 'unavailable', mode: null });
  });

  it('forbids a fresh stopped snapshot', () => {
    expect(decide(op, snap('stopped'))).toMatchObject({
      allowed: false,
      reason: 'forbidden',
      mode: 'stopped',
    });
  });

  it('allows a fresh running snapshot unless the floor is stopped', () => {
    expect(decide(op, snap('running'))).toEqual({
      allowed: true,
      mode: 'running',
      version: 4,
    });
    expect(decide(op, snap('running'), 'issuance_stopped')).toMatchObject({
      allowed: true,
      mode: 'issuance_stopped',
    });
    expect(decide(op, snap('running'), 'stopped')).toMatchObject({
      allowed: false,
      reason: 'forbidden',
      mode: 'stopped',
    });
  });
});

describe('background work', () => {
  it('parks under issuance_stopped and stopped', () => {
    expect(decide(census, snap('issuance_stopped'))).toMatchObject({
      reason: 'parked',
    });
    expect(decide(census, snap('stopped'))).toMatchObject({ reason: 'parked' });
  });

  it.each(['census', 'pruning', 'lease', 'index_touch'] as const)(
    'parks %s when background is parked',
    (work) => {
      expect(
        decide(
          { kind: 'background', work, category: 'index' },
          snap('running', { background: 'parked' })
        )
      ).toMatchObject({ allowed: false, reason: 'parked' });
    }
  );

  it('parks only the background work of a budget-parked category', () => {
    const parked = snap('running', { budgetParks: ['keys'] });
    expect(decide(census, parked)).toMatchObject({ reason: 'parked' });
    expect(
      decide({ kind: 'background', work: 'lease', category: 'index' }, parked)
        .allowed
    ).toBe(true);
  });

  it('never parks security cleanup or issuance through background or budget parks', () => {
    const parked = snap('running', {
      background: 'parked',
      budgetParks: [
        'control',
        'abuse',
        'epoch',
        'index',
        'session',
        'credential',
        'keys',
      ],
    });
    expect(decide({ kind: 'security_cleanup' }, parked).allowed).toBe(true);
    expect(decide({ kind: 'session_issue' }, parked).allowed).toBe(true);
    expect(decide({ kind: 's2s_mint' }, parked).allowed).toBe(true);
    for (const mode of ['issuance_stopped', 'stopped'] as const) {
      expect(
        decide(
          { kind: 'security_cleanup' },
          snap(mode, { background: 'parked' })
        ).allowed
      ).toBe(true);
    }
  });

  it('retries rather than parks without a fresh snapshot', () => {
    expect(decide(census, null)).toMatchObject({ reason: 'unavailable' });
    expect(
      decide(census, snap('running', { readAtMs: NOW - 10_001 }))
    ).toMatchObject({
      reason: 'unavailable',
    });
  });
});

describe('trusted input reads', () => {
  it('ignores a nowMs accessor, leaving no usable snapshot', () => {
    let reads = 0;
    const input = {
      operation: { kind: 'session_issue' } as FenceOperation,
      snapshot: snap('running', { readAtMs: NOW }),
      floor: 'running' as FenceMode,
      get nowMs() {
        reads += 1;
        return NOW;
      },
    };
    expect(fenceDecision(input)).toMatchObject({
      allowed: false,
      reason: 'stale',
      mode: null,
    });
    expect(reads).toBe(0);
  });

  it('ignores an operation.kind accessor, refusing as forbidden', () => {
    let reads = 0;
    const operation = {
      get kind() {
        reads += 1;
        return 'security_cleanup';
      },
    } as unknown as FenceOperation;
    expect(decide(operation, snap('running'))).toMatchObject({
      allowed: false,
      reason: 'forbidden',
    });
    expect(reads).toBe(0);
  });

  it('ignores a snapshot mode accessor, making the snapshot unusable', () => {
    let reads = 0;
    const snapshot = {
      version: 4,
      readAtMs: NOW,
      get mode() {
        reads += 1;
        return 'running';
      },
    } as unknown as FenceSnapshot;
    expect(decide({ kind: 'resolve' }, snapshot)).toMatchObject({
      allowed: false,
      reason: 'unavailable',
      mode: null,
    });
    expect(reads).toBe(0);
  });

  it('never takes mode or kind from a polluted Object.prototype', () => {
    const proto = Object.prototype as { mode?: unknown; kind?: unknown };
    proto.mode = 'running';
    proto.kind = 'security_cleanup';
    try {
      const modeless = {
        version: 4,
        readAtMs: NOW,
      } as unknown as FenceSnapshot;
      expect(decide({ kind: 'session_issue' }, modeless)).toMatchObject({
        allowed: false,
        reason: 'stale',
        mode: null,
      });
      expect(decide({} as never, snap('running'))).toMatchObject({
        allowed: false,
        reason: 'forbidden',
      });
      expect(
        decide(Object.create({ kind: 'logout_own' }), null, 'stopped')
      ).toMatchObject({ allowed: false, reason: 'forbidden' });
      expect(modeAllows('running', {} as never)).toBe(false);
    } finally {
      delete proto.mode;
      delete proto.kind;
    }
  });

  it('copies budgetParks by own index, ignoring an overridden includes', () => {
    const parks = ['keys'];
    Object.setPrototypeOf(
      parks,
      Object.assign(Object.create(Array.prototype), { includes: () => false })
    );
    expect(
      decide(census, snap('running', { budgetParks: parks as never }))
    ).toMatchObject({ allowed: false, reason: 'parked' });
  });

  it('treats a snapshot with non-array budgetParks as unusable', () => {
    expect(
      decide(census, snap('running', { budgetParks: 'keys' as never }))
    ).toMatchObject({ allowed: false, reason: 'unavailable', mode: null });
  });

  it('parks background work without a category', () => {
    expect(
      decide({ kind: 'background', work: 'census' } as never, snap('running'))
    ).toMatchObject({ allowed: false, reason: 'parked' });
  });
});
