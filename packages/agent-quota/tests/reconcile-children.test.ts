import { describe, expect, it } from 'vitest';
import { accountKey, admit, recordObservation } from '../src/admission';
import { receiptReset, recoveryAdmissionKey } from '../src/failure-receipt';
import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
import {
  type ChildSnapshot,
  reconcileChildren,
  recoveryBlockers,
} from '../src/reconcile-children';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T03:38:00Z');
function fixture(): ChildSnapshot {
  return {
    threads: [
      {
        id: 'root',
        parentId: null,
        snoozedUntil: null,
        pendingQuestion: false,
        pendingApproval: false,
        activeWriterNodes: 0,
      },
      {
        id: 'child',
        parentId: 'root',
        snoozedUntil: null,
        pendingQuestion: false,
        pendingApproval: false,
        activeWriterNodes: 0,
      },
    ],
    tasks: [
      {
        id: 'task',
        parentId: 'root',
        childId: 'child',
        status: 'failed',
        origin: 'app_owned',
        instanceId: 'claude_dd',
        deliveryState: 'delivered',
        observedByRunId: 'parent-run',
      },
    ],
    runs: [
      {
        id: 'run2',
        threadId: 'child',
        ordinal: 2,
        status: 'failed',
        completedAt: '2026-10-23T03:37:00Z',
        startedAt: '2026-10-23T03:30:00Z',
        instanceId: 'claude_dd',
        model: 'opus',
        taskId: 'task',
        rootNodeId: 'node2',
        queueHeld: false,
        monitor: false,
      },
    ],
    failures: [
      {
        runId: 'run2',
        nodeId: 'node2',
        message: "You've hit your session limit · resets 11:20am",
        classification: 'usage_limit',
        resetAt: null,
        observedAt: '2026-10-23T03:37:00Z',
      },
    ],
    transfers: [],
  };
}
describe('read-only descendant reconciliation', () => {
  it('reports an original task failure and its delivered receipt', () => {
    const data = fixture();
    const before = JSON.stringify(data);
    const result = reconcileChildren(data, 'root', now, 'Asia/Ho_Chi_Minh');
    expect(result.entries[0]).toMatchObject({
      kind: 'app-owned-delegated-task',
      originalTaskStatus: 'failed',
      latestTurnStatus: 'failed',
      delivery: 'delivered',
      failureClass: 'usage-limit',
      resetAt: '2026-10-23T04:20:00.000Z',
    });
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([
    [
      'Native Claude handoff exceeded context allowance',
      'context-allowance-failure',
    ],
    ['Provider failed to start the resumed run', 'provider-start-failure'],
  ] as const)(
    'records %s as a distinct execution failure, not a quota failure',
    (message, executionOutcome) => {
      const data = fixture();
      data.failures[0]!.message = message;
      data.failures[0]!.classification = null;
      const row = reconcileChildren(data, 'root', now).entries[0];
      expect(row).toMatchObject({
        failureClass: 'other',
        executionOutcome,
        recoveryAdmissionKey: null,
      });
    }
  );
  it('finds a nested descendant while its direct parent waits', () => {
    const data = fixture();
    const child = data.threads[1];
    if (!child) throw Error('fixture');
    child.parentId = 'middle';
    data.threads.push({ ...child, id: 'middle', parentId: 'root' });
    const task = data.tasks[0];
    if (!task) throw Error('fixture');
    task.parentId = 'middle';
    data.runs.push({
      ...data.runs[0],
      id: 'middle-run',
      threadId: 'middle',
      status: 'waiting',
      ordinal: 1,
      completedAt: null,
      startedAt: '2026-10-23T03:00:00Z',
      instanceId: 'codex',
      model: 'model',
      taskId: null,
      rootNodeId: null,
      queueHeld: false,
      monitor: false,
    });
    expect(
      reconcileChildren(data, 'root', now).entries.some(
        (entry) =>
          entry.threadId === 'child' && entry.parentThreadId === 'middle'
      )
    ).toBe(true);
  });
  it('separates completed original task from unbound failed follow-up and blocks queued rollback', () => {
    const data = fixture();
    const original = data.runs[0];
    const task = data.tasks[0];
    const child = data.threads[1];
    if (!original || !task || !child) throw Error('fixture');
    original.status = 'completed';
    task.status = 'completed';
    child.snoozedUntil = '2026-10-23T04:20:00Z';
    data.runs.push({
      ...original,
      id: 'run4',
      ordinal: 4,
      status: 'failed',
      taskId: null,
      rootNodeId: 'node4',
    });
    data.runs.push({
      ...original,
      id: 'run5',
      ordinal: 5,
      status: 'queued',
      startedAt: null,
      completedAt: null,
      taskId: null,
      rootNodeId: null,
    });
    data.failures = data.failures.map((item) => ({
      ...item,
      runId: 'run4',
      nodeId: 'node4',
    }));
    data.failures.push({
      ...data.failures[0],
      runId: 'run4',
      nodeId: 'node4',
      message: "You've hit your session limit · resets 11:20am",
      classification: 'usage_limit',
      resetAt: null,
      observedAt: '2026-10-23T03:37:01Z',
    });
    const result = reconcileChildren(data, 'root', now, 'Asia/Ho_Chi_Minh');
    expect(result.entries).toHaveLength(1);
    expect(recoveryBlockers(result.entries[0])).toEqual([
      'recovery-already-queued',
    ]);
    expect(result.entries[0]).toMatchObject({
      kind: 'thread-send-follow-up',
      originalTaskStatus: 'completed',
      latestTurnStatus: 'failed',
      delivery: 'missing-event',
      disposition: 'auto-resume-already-queued-do-not-duplicate',
      queuedRuns: [
        {
          runId: 'run5',
          providerInstanceId: 'claude_dd',
          model: 'opus',
          held: false,
        },
      ],
      switchBlockers: ['queued-old-account-risk', 'writer-drain-unverified'],
    });
  });
  it('retains delivery across restart without inventing parent drain', () => {
    const data = fixture();
    const task = data.tasks[0];
    if (!task) throw Error('fixture');
    task.observedByRunId = null;
    const before = reconcileChildren(data, 'root', now);
    const after = reconcileChildren(
      JSON.parse(JSON.stringify(data)),
      'root',
      now
    );
    expect(after).toEqual(before);
    expect(after.entries[0]?.delivery).toBe('delivered');
    expect(after.entries[0]?.parentDrainState).toBe('unknown');
  });
  it('requires fresh writer-drain evidence before reporting safe switching', () => {
    const data = fixture();
    expect(reconcileChildren(data, 'root', now).entries[0]?.disposition).toBe(
      'needs-parent-action'
    );
    expect(
      reconcileChildren(data, 'root', now, undefined, {
        child: { drained: true, observedAt: now.toISOString() },
      }).entries[0]?.disposition
    ).toBe('safe-to-switch-account');
  });
  it('detects a redundant native reset continuation after a provider reroute', () => {
    const data = fixture();
    const original = data.runs[0];
    if (!original) throw Error('fixture');
    data.runs.push({
      ...original,
      id: 'run6',
      ordinal: 6,
      status: 'running',
      instanceId: 'codex',
      taskId: 'task6',
    });
    data.runs.push({
      ...original,
      id: 'run7',
      ordinal: 7,
      status: 'queued',
      startedAt: null,
      limitResumeMessageId: 'limit-resume:child:run2:123:legacy',
    });
    expect(
      reconcileChildren(data, 'root', now).entries[0]?.redundantLimitResumes
    ).toMatchObject([
      { runId: 'run7', recommendation: 'preserve-text-then-t3_queue_cancel' },
    ]);
  });
  it('does not invent a timezone for human reset clocks', () => {
    expect(receiptReset('resets 11:20am', now.toISOString())).toBeNull();
  });
  it('reserves duplicate recovery events exactly once, including after completion', () => {
    const accounts: AccountUsage[] = [
      {
        instanceId: 'worker',
        provider: 'codex',
        label: 'worker',
        models: ['model'],
        available: true,
        windows: [],
        accountIdentityHash: 'a'.repeat(64),
      },
      { instanceId: 'owner', provider: 'claude', label: 'owner', windows: [] },
    ];
    const request: AdmissionRequest = {
      requestId: 'caller-id',
      threadId: 'root',
      currentInstanceId: 'owner',
      recovery: { threadId: 'child', runId: 'run4', failure: 'usage-limit' },
      requirements: {
        capability: 'implementation',
        authorizedInstanceIds: ['worker'],
        privacyApprovedInstanceIds: ['worker'],
        candidates: [
          {
            instanceId: 'worker',
            model: 'model',
            capabilities: ['implementation'],
          },
        ],
      },
      policy: {
        orchestratorReservePercent: 30,
        nearUsedPercent: 90,
        unknownMaxConcurrent: 1,
      },
    };
    const context = { accounts, ledger: emptyLedger(), active: [], now };
    expect(admit(request, context).status).toBe('admit');
    expect(
      admit({ ...request, requestId: 'another-id' }, context)
    ).toMatchObject({
      status: 'block',
      reasons: ['admission-already-reserved'],
    });
    const worker = accounts[0];
    if (!worker) throw Error('fixture');
    recordObservation(context.ledger, {
      eventId: 'done',
      instanceId: 'worker',
      accountKey: accountKey(worker),
      requestId: recoveryAdmissionKey('child', 'run4', 'usage-limit'),
      outcome: 'success',
      observedAt: now.toISOString(),
    });
    expect(admit(request, context)).toMatchObject({
      status: 'block',
      reasons: ['admission-already-completed'],
    });
  });
});
