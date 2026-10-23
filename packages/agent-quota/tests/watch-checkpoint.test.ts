import { describe, expect, it } from 'vitest';
import { accountKey } from '../src/accounts';
import {
  checkpointDecision,
  checkpointFailureReason,
} from '../src/checkpoint-ready';
import type { ChildSnapshot } from '../src/reconcile-children';
import type { AccountUsage, RankedInstance } from '../src/types';
import {
  freshRemainingPercent,
  ownerWatchStatus,
  selectSuccessor,
  watchSuccessorReason,
  watchVerdict,
} from '../src/watch';

const at = new Date('2026-10-23T08:00:00Z');
const pool = (
  instanceId: string,
  provider: AccountUsage['provider'] = 'claude'
): AccountUsage => ({
  instanceId,
  provider,
  label: instanceId,
  available: true,
  models:
    provider === 'claude'
      ? ['claude-opus-4-6', 'claude-sonnet-4-5']
      : ['gpt-6.1-sol'],
  windows: [],
});

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

  it('uses the minimum remaining percentage across fresh session and weekly windows', () => {
    const remaining = freshRemainingPercent(
      [
        {
          kind: 'session',
          usedPercent: 90,
          resetsAt: '2026-10-24T08:00:00Z',
          source: 'fixture',
          observedAt: at.toISOString(),
          authoritative: true,
        },
        {
          kind: 'weekly',
          usedPercent: 100,
          resetsAt: '2026-10-30T08:00:00Z',
          source: 'fixture',
          observedAt: at.toISOString(),
          authoritative: true,
        },
      ],
      at,
      15 * 60_000,
      'claude-opus-4-6'
    );
    expect(remaining).toBe(0);
    expect(watchVerdict(remaining)).toBe('switch-now');
  });

  it('watches Codex monthly-only usage and immediately switches on an exhausted window', () => {
    const status = ownerWatchStatus(
      {
        ...pool('codex', 'codex'),
        models: ['gpt-6.1-sol'],
        windows: [
          {
            kind: 'long',
            usedPercent: 100,
            source: 'fixture',
            observedAt: at.toISOString(),
            authoritative: true,
          },
        ],
      },
      [],
      [],
      at,
      { model: 'gpt-6.1-sol' }
    );
    expect(status).toMatchObject({
      remaining: undefined,
      verdict: 'switch-now',
    });
  });

  it('switches on a stale exhausted weekly window despite a fresh session window', () => {
    const status = ownerWatchStatus(
      {
        ...pool('claude_kv'),
        windows: [
          {
            kind: 'session',
            usedPercent: 10,
            resetsAt: '2026-10-23T09:00:00Z',
            source: 'fixture',
            observedAt: at.toISOString(),
            authoritative: true,
          },
          {
            kind: 'weekly',
            usedPercent: 100,
            resetsAt: '2026-10-26T08:00:00Z',
            source: 'fixture',
            observedAt: '2026-10-22T08:00:00Z',
            authoritative: true,
          },
        ],
      },
      [],
      [],
      at,
      { model: 'claude-opus-4-6' }
    );
    expect(status).toMatchObject({
      remaining: undefined,
      verdict: 'switch-now',
      reason: 'reported-limit-not-reset',
    });
  });

  it('does not let a future observation timestamp disarm resetless exhaustion', () => {
    const status = ownerWatchStatus(
      {
        ...pool('claude_kv'),
        windows: [
          {
            kind: 'session',
            usedPercent: 100,
            source: 'fixture',
            observedAt: new Date(at.getTime() + 60 * 60_000).toISOString(),
            authoritative: true,
          },
        ],
      },
      [],
      [],
      at,
      { model: 'claude-opus-4-6' }
    );
    expect(status).toMatchObject({
      verdict: 'switch-now',
      reason: 'reported-limit-not-reset',
    });
  });

  it('returns stable checkpoint failure codes without exposing SQLite text', () => {
    expect(
      checkpointFailureReason(new Error('no such table: private_schema'))
    ).toBe('checkpoint-state-unavailable');
    expect(
      checkpointFailureReason(new Error('checkpoint-thread-unavailable'))
    ).toBe('checkpoint-thread-unavailable');
  });

  it.each(['claude_kv', 'claude_mira'])(
    'switches immediately when %s has an active block despite healthy cache data',
    (instanceId) => {
      const account = {
        ...pool(instanceId),
        windows: [
          {
            kind: 'session' as const,
            usedPercent: 10,
            source: 'fixture',
            observedAt: at.toISOString(),
            authoritative: true,
          },
        ],
      };
      const status = ownerWatchStatus(
        account,
        [
          {
            pool: instanceId,
            modelScope: '*',
            reason: 'observed limit',
            observedAt: at.toISOString(),
            resetAt: new Date(at.getTime() + 60_000).toISOString(),
          },
        ],
        [],
        at,
        { model: 'claude-opus-4-6' }
      );
      expect(status).toMatchObject({
        verdict: 'switch-now',
        reason: 'active-block',
      });
    }
  );

  it('switches immediately on an active usage-limit receipt', () => {
    const account = {
      ...pool('claude_kv'),
      windows: [
        {
          kind: 'session' as const,
          usedPercent: 10,
          source: 'fixture',
          observedAt: at.toISOString(),
          authoritative: true,
        },
      ],
    };
    const status = ownerWatchStatus(
      account,
      [],
      [
        {
          eventId: 'usage-limit',
          instanceId: account.instanceId,
          accountKey: accountKey(account),
          outcome: 'usage-limit',
          observedAt: at.toISOString(),
          resetsAt: new Date(at.getTime() + 60_000).toISOString(),
          model: 'claude-opus-4-6',
        },
      ],
      at,
      { model: 'claude-opus-4-6' }
    );
    expect(status).toMatchObject({
      verdict: 'switch-now',
      reason: 'active-ledger-receipt',
    });
  });

  it('hides main-role successor reasons on healthy owner verdicts', () => {
    expect(watchSuccessorReason('ok', 'main', undefined, [])).toBeUndefined();
  });

  it('never chooses owner, blocked, active, reserved, receipt-fenced or cooled successors', () => {
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
        rank('limit-receipt', 'healthy'),
        rank('capacity-cooldown', 'healthy'),
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
      at,
      {},
      {},
      [],
      {},
      'child',
      false,
      [
        {
          eventId: 'limit',
          instanceId: 'limit-receipt',
          accountKey: 'claude:instance:limit-receipt',
          outcome: 'usage-limit',
          observedAt: at.toISOString(),
          resetsAt: new Date(at.getTime() + 60_000).toISOString(),
        },
        {
          eventId: 'capacity',
          instanceId: 'capacity-cooldown',
          accountKey: 'codex:instance:capacity-cooldown',
          outcome: 'capacity-error',
          observedAt: at.toISOString(),
          model: 'gpt-6.1-sol',
        },
      ]
    );
    expect(chosen).toBe('good');
  });

  it('prefers Claude only for main successor selection and requires explicit fallback', () => {
    const rank = (
      instanceId: string,
      provider: RankedInstance['provider'],
      state: RankedInstance['state'] = 'healthy'
    ): RankedInstance => ({
      instanceId,
      provider,
      label: instanceId,
      state,
      ageMs: 0,
      ttlMs: 900_000,
      activeCount: 0,
      action: state === 'healthy' ? 'delegate' : 'drain',
      instanceIds: [instanceId],
      score: 80,
      eligible: state === 'healthy',
      reasons: [],
    });
    const ranking = [rank('codex', 'codex'), rank('claude', 'claude')];
    expect(
      selectSuccessor([], ranking, [], [], at, {}, {}, [], {}, 'main')
    ).toBe('claude');
    expect(
      selectSuccessor([], ranking, [], [], at, {}, {}, [], {}, 'child')
    ).toBe('codex');
    const exhaustedClaude = [
      rank('claude', 'claude', 'exhausted'),
      rank('codex', 'codex'),
    ];
    expect(
      selectSuccessor([], exhaustedClaude, [], [], at, {}, {}, [], {}, 'main')
    ).toBeUndefined();
    expect(
      selectSuccessor([], ranking, [], ['claude'], at, {}, {}, [], {}, 'main')
    ).toBeUndefined();
    expect(
      selectSuccessor(
        [],
        exhaustedClaude,
        [],
        [],
        at,
        {},
        {},
        [],
        {},
        'main',
        true
      )
    ).toBe('codex');
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
