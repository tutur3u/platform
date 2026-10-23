import { describe, expect, it } from 'vitest';
import { checkHandover, type HandoverEvidence } from '../src/handover';
import { emptyLedger } from '../src/hook-ledger';
import type { SwitchEvidence } from '../src/hooks-types';
import { acquireSwitchLease } from '../src/switch-safety';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T01:00:00Z');
const current: AccountUsage = {
  instanceId: 'current',
  provider: 'codex',
  label: 'owner',
  windows: [
    {
      kind: 'short',
      usedPercent: 20,
      observedAt: now.toISOString(),
      resetsAt: '2026-10-23T02:00:00Z',
      authoritative: true,
      source: 'fixture',
    },
  ],
};
const switching: SwitchEvidence = {
  threadId: 'owner',
  attemptId: 'attempt',
  accountKey: 'claude:target',
  observedAt: now.toISOString(),
  threadIdle: true,
  queue: { threadId: 'owner', complete: true, items: [] },
  unfinishedWriterIds: [],
  backgroundJobIds: [],
  children: { preserved: true, ids: [] },
  watches: { preserved: true, ids: [] },
  uncertainMutationIds: [],
};
const handover: HandoverEvidence = {
  inThreadSwitchSupported: false,
  successorCount: 0,
  oldWriterDrainedOrStopped: true,
  sourcePreserved: true,
  dirtyFilesPreserved: true,
  indexPreserved: true,
  jobsPreserved: true,
  childParentsPreserved: true,
  questionsPreserved: true,
  watchesPreserved: true,
  unknownWritesPreserved: true,
  bindingVerified: false,
  successorIndependentlyAccepted: false,
  acceptanceRecorded: false,
};
describe('replacement handover decision', () => {
  it('never recommends a successor for a healthy current account', () => {
    expect(
      checkHandover(emptyLedger(), current, switching, handover, now)
    ).toMatchObject({ path: 'stay', successorRecommended: false });
  });
  it('lists gates and requires independent acceptance before settling', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(
      ledger,
      {
        ...switching,
        pid: 123,
        processStartedAt: now.toISOString(),
        ttlMs: 1000,
      },
      now
    );
    const exhausted = {
      ...current,
      windows: current.windows.map((window) => ({
        ...window,
        usedPercent: 100,
      })),
    };
    expect(
      checkHandover(ledger, exhausted, switching, handover, now)
    ).toMatchObject({
      path: 'successor',
      status: 'block',
      successorRecommended: true,
    });
    expect(
      checkHandover(
        ledger,
        exhausted,
        switching,
        {
          ...handover,
          successorCount: 1,
          bindingVerified: true,
          successorIndependentlyAccepted: true,
          acceptanceRecorded: true,
        },
        now
      )
    ).toMatchObject({
      path: 'successor',
      status: 'pass',
      successorRecommended: false,
    });
    expect(
      checkHandover(
        ledger,
        exhausted,
        switching,
        { ...handover, successorCount: 2 },
        now
      ).reasons
    ).toContain('successor-already-exists');
  });
});
