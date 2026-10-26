import { expect, it } from 'vite-plus/test';
import { LedgerCore, memoryLedgerStore } from './ledger';

const SLOT = '2026-10-23T03:17:00.000Z';
const NEXT_SLOT = '2026-10-24T03:17:00.000Z';

function ledger() {
  const { counts, store } = memoryLedgerStore();
  return { core: new LedgerCore(store), counts, store };
}

function claim(core: LedgerCore, slot = SLOT, now = 0) {
  return core.claim({
    jobId: 'job',
    leaseMs: 1_000,
    maxConsecutiveFailures: 3,
    now,
    slot,
  });
}

function complete(
  core: LedgerCore,
  outcome: 'failed' | 'ok' | 'unknown',
  slot = SLOT,
  generation = 1
) {
  return core.complete({
    generation,
    jobId: 'job',
    maxConsecutiveFailures: 3,
    now: 5,
    outcome,
    slot,
  });
}

it('grants one claim per slot and writes once', () => {
  const { core, counts } = ledger();
  expect(claim(core)).toEqual({ granted: true, generation: 1 });
  expect(claim(core, SLOT, 2_000)).toEqual({
    granted: false,
    reason: 'duplicate',
  });
  expect(counts.writes).toBe(1);
});

it('refuses an older slot delivered late', () => {
  const { core } = ledger();
  claim(core, NEXT_SLOT);
  complete(core, 'ok', NEXT_SLOT);
  expect(claim(core, SLOT, 10_000)).toMatchObject({ reason: 'duplicate' });
});

it('skips a new slot while the previous lease is active, then recovers', () => {
  const { core } = ledger();
  claim(core, SLOT, 0);
  expect(claim(core, NEXT_SLOT, 999)).toMatchObject({ reason: 'busy' });
  expect(claim(core, NEXT_SLOT, 1_000)).toMatchObject({ granted: true });
});

it('a stopped job writes nothing on later ticks', () => {
  const { core, counts } = ledger();
  core.stop('job', 'operator');
  const writes = counts.writes;
  for (let index = 0; index < 10; index++)
    expect(claim(core, `2026-10-23T03:${10 + index}:00.000Z`)).toMatchObject({
      reason: 'stopped',
    });
  expect(counts.writes).toBe(writes);
});

it('exhausts a durable failure budget that survives restart', () => {
  const { core, store } = ledger();
  for (const [index, outcome] of (['failed', 'unknown'] as const).entries()) {
    const slot = `2026-10-23T03:0${index}:00.000Z`;
    claim(core, slot);
    complete(core, outcome, slot);
  }
  // A fresh core over the same storage models a Durable Object restart.
  const restarted = new LedgerCore(store);
  claim(restarted, '2026-10-23T03:05:00.000Z');
  const state = complete(restarted, 'failed', '2026-10-23T03:05:00.000Z');
  expect(state).toMatchObject({
    consecutiveFailures: 3,
    stopReason: 'failure-budget-exhausted',
    stopped: true,
  });
  expect(claim(restarted, NEXT_SLOT)).toMatchObject({ reason: 'stopped' });
});

it('a success resets the failure counter', () => {
  const { core } = ledger();
  claim(core, SLOT);
  complete(core, 'failed');
  claim(core, NEXT_SLOT);
  expect(complete(core, 'ok', NEXT_SLOT)).toMatchObject({
    consecutiveFailures: 0,
    lastCompletedAt: 5,
    leaseUntil: 0,
  });
});

it('resume fences out a completion and retry from the stopped generation', () => {
  const { core } = ledger();
  claim(core);
  core.stop('job', 'operator');
  expect(core.checkFence('job', 1)).toBe(false);
  const resumed = core.resume('job');
  expect(resumed).toMatchObject({ generation: 2, stopped: false });
  expect(core.checkFence('job', 1)).toBe(false);
  expect(complete(core, 'failed', SLOT, 1)).toEqual(resumed);
  expect(core.checkFence('job', 2)).toBe(true);
});

it('ignores a completion for a slot that is no longer current', () => {
  const { core } = ledger();
  claim(core, SLOT, 0);
  claim(core, NEXT_SLOT, 5_000);
  // The abandoned SLOT run was charged once when NEXT_SLOT reconciled it;
  // its late completion is ignored rather than charged again.
  expect(complete(core, 'failed', SLOT)).toMatchObject({
    consecutiveFailures: 1,
    lastOutcome: 'unknown',
    lastSlot: NEXT_SLOT,
  });
});

it('repeated termination across restarts exhausts the durable budget', () => {
  const { store } = memoryLedgerStore();
  const slotFor = (day: number) => `2026-10-${23 + day}T03:17:00.000Z`;
  // Each claim is abandoned (the run is terminated before it completes) and
  // the next tick runs on a fresh Durable Object instance over the same store.
  for (let day = 0; day < 3; day++)
    expect(
      new LedgerCore(store).claim({
        jobId: 'job',
        leaseMs: 1_000,
        maxConsecutiveFailures: 3,
        now: day * 10_000,
        slot: slotFor(day),
      })
    ).toMatchObject({ granted: true });
  const restarted = new LedgerCore(store);
  expect(
    restarted.claim({
      jobId: 'job',
      leaseMs: 1_000,
      maxConsecutiveFailures: 3,
      now: 3 * 10_000,
      slot: slotFor(3),
    })
  ).toEqual({ granted: false, reason: 'stopped' });
  expect(restarted.status().job).toMatchObject({
    consecutiveFailures: 3,
    lastOutcome: 'unknown',
    leaseUntil: 0,
    stopReason: 'failure-budget-exhausted',
    stopped: true,
  });
});

it.each(['failed', 'ok'] as const)(
  'ignores late %s after exhausting reconciliation across restart',
  (outcome) => {
    const { core, store, counts } = ledger();
    claim(core, SLOT);
    complete(core, 'failed');
    claim(core, NEXT_SLOT);
    complete(core, 'failed', NEXT_SLOT);
    const abandonedSlot = '2026-10-25T03:17:00.000Z';
    claim(core, abandonedSlot);
    expect(claim(core, '2026-10-26T03:17:00.000Z', 2_000)).toMatchObject({
      reason: 'stopped',
    });
    const settled = core.status().job;
    const writes = counts.writes;
    const restarted = new LedgerCore(store);
    expect(complete(restarted, outcome, abandonedSlot)).toEqual(settled);
    expect(counts.writes).toBe(writes);
    expect(settled).toMatchObject({
      consecutiveFailures: 3,
      lastOutcome: 'unknown',
      stopped: true,
    });
  }
);

it('persists per-item attempts and quarantine across restarts without discarding other work', () => {
  const { store } = ledger();
  const core = new LedgerCore(store);
  core.addPendingWork('job', ['poison', 'healthy']);
  for (let attempt = 0; attempt < 3; attempt++) {
    const restarted = new LedgerCore(store);
    expect(restarted.failPendingWork('job', ['poison', 'poison'])).toEqual(
      attempt === 2 ? ['poison'] : []
    );
  }
  const restarted = new LedgerCore(store);
  expect(restarted.pendingWork('job')).toEqual(['healthy']);
  expect(restarted.quarantinedWork('job')).toEqual(['poison']);
  restarted.addPendingWork('job', ['poison']);
  expect(restarted.pendingWork('job')).toEqual(['healthy']);
  restarted.settlePendingWork('job', ['healthy']);
  restarted.resume('job');
  expect(restarted.quarantinedWork('job')).toEqual(['poison']);
});

it('fences late obligation settlement and failure charges from an earlier slot', () => {
  const { core } = ledger();
  claim(core, SLOT);
  core.addPendingWork('job', ['workspace']);
  claim(core, NEXT_SLOT, 2_000);
  const snapshot = core.status().job;
  core.settlePendingWork('job', ['workspace'], { generation: 1, slot: SLOT });
  core.failPendingWork('job', ['workspace'], { generation: 1, slot: SLOT });
  expect(core.status().job).toEqual(snapshot);
  core.settlePendingWork('job', ['workspace'], {
    generation: 1,
    slot: NEXT_SLOT,
  });
  expect(core.pendingWork('job')).toEqual([]);
});

it('persists degraded completion across restart, resets fatal streak and preserves last productive completion', () => {
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const complete = (
    slot: string,
    now: number,
    outcome: 'ok' | 'failed' | 'degraded'
  ) => {
    const claim = core.claim({
      jobId: 'calendar-provider-sync',
      slot,
      now,
      leaseMs: 1,
      maxConsecutiveFailures: 5,
    });
    if (!claim.granted) throw new Error('Expected admission');
    return core.complete({
      jobId: 'calendar-provider-sync',
      slot,
      now,
      outcome,
      generation: claim.generation,
      maxConsecutiveFailures: 5,
    });
  };
  complete('1', 1, 'ok');
  complete('2', 2, 'failed');
  complete('3', 3, 'degraded');
  expect(
    new LedgerCore(store).status()['calendar-provider-sync']
  ).toMatchObject({
    lastOutcome: 'degraded',
    consecutiveFailures: 0,
    lastCompletedAt: 1,
    stopped: false,
  });
});
