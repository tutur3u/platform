import { describe, expect, it } from 'vitest';
import { checkpointDecision } from '../src/checkpoint-ready';
import type { ChildSnapshot } from '../src/reconcile-children';
import type { RankedInstance } from '../src/types';
import {
  freshRemainingPercent,
  selectSuccessor,
  watchVerdict,
} from '../src/watch';

const at = new Date('2026-10-23T08:00:00Z');

describe('quota turn-boundary watch', () => {
  it('crosses warning and critical thresholds, with hysteresis on recovery', () => {
    expect(watchVerdict(26)).toBe('ok');
    expect(watchVerdict(25)).toBe('warn');
    expect(watchVerdict(12)).toBe('switch-now');
    expect(watchVerdict(27, { previous: 'warn' })).toBe('warn');
    expect(watchVerdict(29, { previous: 'warn' })).toBe('ok');
    expect(watchVerdict(14, { previous: 'switch-now' })).toBe('switch-now');
    expect(watchVerdict(16, { previous: 'switch-now' })).toBe('warn');
  });

  it('turns missing or stale observations into warn, never ok', () => {
    expect(watchVerdict(undefined)).toBe('warn');
    const remaining = freshRemainingPercent(
      [
        {
          kind: 'session',
          usedPercent: 10,
          resetsAt: '2026-10-23T09:00:00Z',
          source: 'sanitized-fixture',
          observedAt: '2026-10-23T07:00:00Z',
          authoritative: true,
        },
      ],
      at,
      15 * 60_000
    );
    expect(remaining).toBeUndefined();
    expect(watchVerdict(remaining)).toBe('warn');
  });

  it('never chooses the owner, blocked, active or reserved successor', () => {
    const rank = (
      instanceId: string,
      state: RankedInstance['state'],
      eligible = true,
      activeCount = 0
    ): RankedInstance => ({
      instanceId,
      provider: 'codex',
      label: instanceId,
      state,
      ageMs: 0,
      ttlMs: 900_000,
      activeCount,
      action: 'delegate',
      instanceIds: [instanceId],
      score: 10,
      eligible,
      reasons: [],
    });
    const chosen = selectSuccessor(
      ['owner'],
      [
        rank('owner', 'healthy'),
        rank('blocked', 'healthy'),
        rank('reserved', 'healthy'),
        rank('unknown', 'UNKNOWN'),
        rank('good', 'healthy'),
      ],
      [
        {
          pool: 'blocked',
          modelScope: '*',
          reason: 'limit',
          observedAt: at.toISOString(),
          resetAt: new Date(at.getTime() + 60_000).toISOString(),
        },
      ],
      ['reserved'],
      at
    );
    expect(chosen).toBe('good');
  });
});

function checkpointFixture(): ChildSnapshot {
  return {
    threads: [
      {
        id: 'owner-thread',
        parentId: null,
        snoozedUntil: null,
        pendingQuestion: false,
        pendingApproval: false,
        activeWriterNodes: 0,
      },
    ],
    runs: [],
    tasks: [],
    failures: [],
    transfers: [],
  };
}

describe('checkpoint-ready process fence', () => {
  it('refuses a checkpoint when a watcher-owned gh pr merge is in flight', () => {
    const result = checkpointDecision(
      'owner-thread',
      checkpointFixture(),
      [10],
      [
        { pid: 10, ppid: 1, command: 'quota-watch' },
        { pid: 11, ppid: 10, command: '/usr/local/bin/gh pr merge 123' },
      ]
    );
    expect(result).toMatchObject({
      result: 'no-go',
      mergePids: [11],
      reasons: ['gh-pr-merge-in-flight'],
    });
  });

  it('blocks on a queued run even with no active writer or merge', () => {
    const snapshot = checkpointFixture();
    snapshot.runs.push({
      id: 'queued-old-model',
      threadId: 'owner-thread',
      ordinal: 2,
      status: 'queued',
      completedAt: null,
      startedAt: null,
      instanceId: 'claude_hehe',
      model: 'model-old',
      taskId: null,
      rootNodeId: null,
      queueHeld: false,
      monitor: false,
    });
    const result = checkpointDecision(
      'owner-thread',
      snapshot,
      [10],
      [{ pid: 10, ppid: 1, command: 'quota-watch' }]
    );
    expect(result.reasons).toContain('queue-not-empty');
    expect(result.result).toBe('no-go');
  });
});
