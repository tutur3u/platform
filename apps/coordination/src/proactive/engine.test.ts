import { describe, expect, it } from 'vitest';
import { unavailableAuthority } from './authority';
import { DueJobEngine, nextWake } from './engine';
import type {
  Authority,
  AuthoritySnapshot,
  DueJob,
  JobState,
  JobStore,
} from './contracts';

const now = Date.UTC(2026, 9, 12, 12);
const job: DueJob = {
  actorId: 'actor',
  workspaceId: 'personal',
  occurrenceId: 'daily-1',
  dueAt: now,
  expiresAt: now + 60_000,
  sourceVersion: 'source-1',
  consentVersion: 'consent-1',
  action: 'reflection-dry-run',
};
function qualified(at = now): AuthoritySnapshot {
  return {
    kind: 'qualified',
    checkedAt: at,
    validUntil: at + 5_000,
    paid: true,
    context: {
      qualified: false,
      allowedSources: [],
      permissionVersion: 'unqualified',
      canResearch: false,
      canPlan: false,
      canDryRun: false,
      evidence: [],
    },
    consent: {
      actorId: 'actor',
      workspaceId: 'personal',
      creatorId: 'actor',
      personal: true,
      enabled: true,
      paused: false,
      version: 'consent-1',
      sourceVersion: 'source-1',
      timezone: 'UTC',
      cadenceMs: 86_400_000,
      previousDueAt: null,
      quietHours: null,
      maxRuns: 1,
      remainingUnits: 1,
    },
  };
}
class Store implements JobStore {
  state: JobState | null = null;
  read() {
    return this.state;
  }
  write(state: JobState) {
    this.state = structuredClone(state);
  }
  transaction<T>(operation: () => T) {
    return operation();
  }
}
function fixture() {
  const store = new Store();
  let time = now;
  let snapshot = qualified();
  const authority: Authority = {
    async read() {
      return snapshot;
    },
  };
  const engine = new DueJobEngine(
    store,
    authority,
    () => time,
    () => crypto.randomUUID()
  );
  return {
    store,
    engine,
    setTime(at: number) {
      time = at;
    },
    setSnapshot(value: AuthoritySnapshot) {
      snapshot = value;
    },
  };
}

it('missing authority denies without scheduling or persistence', async () => {
  const store = new Store();
  const engine = new DueJobEngine(
    store,
    unavailableAuthority,
    () => now,
    () => 'lease'
  );
  expect(await engine.submit(job)).toEqual({
    kind: 'denied',
    reason: 'authority-unqualified',
  });
  expect(nextWake(store.read())).toBeNull();
});
it('due event completes one private metadata dry-run and survives replay', async () => {
  const f = fixture();
  await f.engine.submit(job);
  expect(nextWake(f.store.read())).toBe(now);
  await f.engine.execute();
  expect(f.store.state).toEqual({
    job,
    runs: 1,
    phase: {
      kind: 'completed',
      result: {
        kind: 'reflection-dry-run',
        occurrenceId: 'daily-1',
        sourceVersion: 'source-1',
        visibility: 'private',
        sourceRead: false,
        providerCalled: false,
      },
    },
  });
  const before = structuredClone(f.store.state);
  await f.engine.execute();
  await f.engine.submit(job);
  expect(f.store.state).toEqual(before);
  expect(nextWake(f.store.state)).toBeNull();
});
it('checks fresh paid/consent at execution, then permanently stops', async () => {
  const f = fixture();
  await f.engine.submit(job);
  const snapshot = qualified();
  if (snapshot.kind !== 'qualified') throw new Error('fixture');
  snapshot.paid = false;
  f.setSnapshot(snapshot);
  await f.engine.execute();
  expect(f.store.state?.phase).toEqual({
    kind: 'cancelled',
    reason: 'paid-required',
  });
  f.setSnapshot(qualified());
  await f.engine.execute();
  await f.engine.submit(job);
  expect(f.store.state?.runs).toBe(0);
  expect(nextWake(f.store.state)).toBeNull();
});
it('waits until due and cancels expired work', async () => {
  const f = fixture();
  f.setTime(now - 1000);
  f.setSnapshot(qualified(now - 1000));
  await f.engine.submit(job);
  expect(await f.engine.execute()).toEqual({ kind: 'waiting', at: now });
  f.setTime(job.expiresAt);
  f.setSnapshot(qualified(job.expiresAt));
  await f.engine.execute();
  expect(f.store.state?.phase).toEqual({
    kind: 'cancelled',
    reason: 'expired',
  });
});
it('rejects tenant, source, schedule and occurrence rebinding', async () => {
  const f = fixture();
  await f.engine.submit(job);
  for (const change of [
    { actorId: 'other' },
    { workspaceId: 'other' },
    { sourceVersion: 'source-2' },
    { dueAt: now + 1 },
    { occurrenceId: 'daily-2' },
  ]) {
    expect(await f.engine.submit({ ...job, ...change })).toEqual({
      kind: 'denied',
      reason: 'identity-conflict',
    });
  }
  expect(
    f.engine.stop({ actorId: 'other', workspaceId: 'personal' }, 'cancel')
  ).toEqual({ kind: 'denied', reason: 'identity-conflict' });
});
it('keeps a durable cancellation fence against late and duplicate execution', async () => {
  const f = fixture();
  await f.engine.submit(job);
  f.engine.stop(job, 'user-cancelled');
  await f.engine.execute();
  await f.engine.submit(job);
  expect(f.store.state?.phase).toEqual({
    kind: 'cancelled',
    reason: 'user-cancelled',
  });
  expect(f.store.state?.runs).toBe(0);
});
it('recovers a crashed lease as unknown without another authority/provider attempt', async () => {
  const f = fixture();
  f.store.write({
    job,
    runs: 1,
    phase: { kind: 'leased', token: 'old', until: now + 10 },
  });
  expect(await f.engine.execute()).toEqual({ kind: 'waiting', at: now + 10 });
  f.setTime(now + 10);
  await f.engine.execute();
  await f.engine.execute();
  expect(f.store.state?.phase).toEqual({
    kind: 'unknown',
    acceptance: 'unknown',
  });
  expect(f.store.state?.runs).toBe(1);
  expect(nextWake(f.store.state)).toBeNull();
});
it('does not replay a persisted provider acceptance or dead-letter', async () => {
  const f = fixture();
  for (const phase of [
    { kind: 'unknown', acceptance: 'accepted' },
    { kind: 'dead-letter', reason: 'qualification-failed' },
  ] satisfies JobState['phase'][]) {
    f.store.write({ job, runs: 1, phase });
    await f.engine.execute();
    expect(f.store.state?.phase).toEqual(phase);
    expect(nextWake(f.store.state)).toBeNull();
  }
});
it('cancellation while authority is pending prevents a late claim', async () => {
  const store = new Store();
  store.write({ job, runs: 0, phase: { kind: 'pending' } });
  let release: (snapshot: AuthoritySnapshot) => void = () => {
    throw new Error('not ready');
  };
  const authority: Authority = {
    read: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  };
  const engine = new DueJobEngine(
    store,
    authority,
    () => now,
    () => 'lease'
  );
  const executing = engine.execute();
  engine.stop(job, 'user-cancelled');
  release(qualified());
  await executing;
  expect(store.state?.phase).toEqual({
    kind: 'cancelled',
    reason: 'user-cancelled',
  });
  expect(store.state?.runs).toBe(0);
});
it('concurrent duplicate wakes reserve one run', async () => {
  const f = fixture();
  await f.engine.submit(job);
  await Promise.all([f.engine.execute(), f.engine.execute()]);
  expect(f.store.state?.runs).toBe(1);
  expect(f.store.state?.phase.kind).toBe('completed');
});
describe('authority guards', () => {
  const cases = [
    ['paused', { paused: true }, 'consent-disabled'],
    ['disabled', { enabled: false }, 'consent-disabled'],
    ['owner', { creatorId: 'other' }, 'personal-owner-required'],
    ['nonpersonal', { personal: false }, 'personal-owner-required'],
    ['revision', { sourceVersion: 'source-2' }, 'revision-conflict'],
    ['consent', { version: 'consent-2' }, 'revision-conflict'],
    ['cadence', { cadenceMs: 1 }, 'cadence-denied'],
    ['spam', { previousDueAt: now - 1 }, 'cadence-denied'],
    ['budget', { remainingUnits: 0 }, 'budget-exhausted'],
    ['runs', { maxRuns: 4 }, 'budget-exhausted'],
    ['timezone', { timezone: 'Invalid/Zone' }, 'timezone-invalid'],
    [
      'quiet',
      { quietHours: { startMinute: 600, endMinute: 800 } },
      'quiet-hours',
    ],
    [
      'quiet-wrap',
      { quietHours: { startMinute: 700, endMinute: 600 } },
      'quiet-hours',
    ],
  ] satisfies [
    string,
    Partial<Extract<AuthoritySnapshot, { kind: 'qualified' }>['consent']>,
    string,
  ][];
  for (const [name, change, reason] of cases)
    it(name, async () => {
      const f = fixture();
      const snapshot = qualified();
      if (snapshot.kind !== 'qualified') throw new Error('fixture');
      Object.assign(snapshot.consent, change);
      f.setSnapshot(snapshot);
      expect(await f.engine.submit(job)).toEqual({ kind: 'denied', reason });
      expect(f.store.state).toBeNull();
    });
  it('stale, future and failing authority deny', async () => {
    const f = fixture();
    f.setSnapshot(qualified(now - 6000));
    expect(await f.engine.submit(job)).toEqual({
      kind: 'denied',
      reason: 'authority-stale',
    });
    f.setSnapshot(qualified(now + 1));
    expect(await f.engine.submit(job)).toEqual({
      kind: 'denied',
      reason: 'authority-stale',
    });
    const engine = new DueJobEngine(
      f.store,
      {
        async read() {
          throw new Error('offline');
        },
      },
      () => now,
      () => 'lease'
    );
    expect(await engine.submit(job)).toEqual({
      kind: 'denied',
      reason: 'authority-unavailable',
    });
  });
});

it('untrusted snapshots cannot omit quiet/timezone fields or grant truthy permissions', async () => {
  const snapshot = qualified();
  if (snapshot.kind !== 'qualified') throw new Error('fixture');
  const { timezone: _timezone, ...withoutTimezone } = snapshot.consent;
  const { quietHours: _quiet, ...withoutQuiet } = snapshot.consent;
  for (const output of [
    { ...snapshot, consent: withoutTimezone },
    { ...snapshot, consent: withoutQuiet },
    { ...snapshot, context: { ...snapshot.context, qualified: 'yes' } },
    { ...snapshot, paid: 'yes' },
  ]) {
    const store = new Store();
    const engine = new DueJobEngine(
      store,
      {
        async read() {
          return output;
        },
      },
      () => now,
      () => 'lease'
    );
    expect(await engine.submit(job)).toEqual({
      kind: 'denied',
      reason: 'authority-unqualified',
    });
    expect(store.read()).toBeNull();
  }
});
