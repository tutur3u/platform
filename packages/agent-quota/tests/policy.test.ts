import { describe, expect, it } from 'vitest';
import { recommend, recommendAssignments } from '../src/policy';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T00:00:00.000Z');
function account(
  instanceId: string,
  usedPercent: number,
  observedAt = now.toISOString()
): AccountUsage {
  return {
    instanceId,
    provider: instanceId.startsWith('claude') ? 'claude' : 'codex',
    label: instanceId,
    windows: [
      {
        kind: 'short',
        usedPercent,
        resetsAt: '2026-10-23T00:30:00.000Z',
        source: 'fixture',
        observedAt,
        authoritative: true,
      },
    ],
  };
}

describe('routing policy', () => {
  it('excludes accounts above the hard limit and ranks remaining headroom', () => {
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [account('codex', 92), account('codex_ai4ed', 35)],
      now,
    });
    expect(result.ranked[0]?.instanceId).toBe('codex_ai4ed');
    expect(
      result.ranked.find((item) => item.instanceId === 'codex')?.eligible
    ).toBe(false);
    expect(
      result.ranked
        .find((item) => item.instanceId === 'codex')
        ?.reasons.some((reason) => reason.code === 'near-limit')
    ).toBe(true);
  });

  it('spreads concurrent assignments over eligible accounts', () => {
    const selected = recommendAssignments({
      task: { provider: 'codex' },
      active: [],
      accounts: [account('codex', 20), account('codex_ai4ed', 22)],
      count: 4,
      now,
    });
    expect(selected.map((item) => item.instanceId)).toEqual([
      'codex',
      'codex_ai4ed',
      'codex',
      'codex_ai4ed',
    ]);
  });

  it('treats stale quota as uncertain and lowers its rank', () => {
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [
        account('codex', 20, '2026-10-22T20:00:00.000Z'),
        account('codex_ai4ed', 40),
      ],
      now,
    });
    expect(result.ranked[0]?.instanceId).toBe('codex_ai4ed');
    expect(
      result.ranked[1]?.reasons.some((reason) => reason.code === 'stale')
    ).toBe(true);
  });

  it('excludes stale over-limit usage while its reported reset is future', () => {
    const staleExhaustion = account(
      'claude_dd',
      100,
      '2026-10-22T20:00:00.000Z'
    );
    staleExhaustion.windows[0]!.resetsAt = '2026-10-23T01:00:00.000Z';
    const result = recommend({
      task: { provider: 'claude' },
      active: [],
      accounts: [staleExhaustion],
      now,
    });
    expect(result.ranked[0]?.eligible).toBe(false);
    expect(result.selected).toHaveLength(0);
    expect(
      result.ranked[0]?.reasons.some(
        (reason) => reason.code === 'near-limit-stale'
      )
    ).toBe(true);
  });

  it('keeps a stale hard-limit window binding through a bounded no-reset age', () => {
    const staleNoReset = account('claudeAgent', 95, '2026-10-20T00:00:00.000Z');
    staleNoReset.windows[0]!.kind = 'long';
    delete staleNoReset.windows[0]!.resetsAt;
    const result = recommend({
      task: { model: 'claude-opus-4-6' },
      active: [],
      accounts: [staleNoReset],
      now,
    });
    expect(result.ranked[0]?.state).toBe('UNKNOWN');
    expect(result.ranked[0]?.eligible).toBe(false);
    expect(
      result.ranked[0]?.reasons.some(
        (reason) => reason.code === 'near-limit-stale'
      )
    ).toBe(true);
  });

  it('bounds resetless manual session exhaustion by its five-hour window', () => {
    const withinWindow = account(
      'claudeAgent',
      100,
      new Date(now.getTime() - 4 * 60 * 60_000).toISOString()
    );
    delete withinWindow.windows[0]!.resetsAt;
    const beyondWindow = account(
      'claudeAgent',
      100,
      new Date(now.getTime() - 6 * 60 * 60_000).toISOString()
    );
    delete beyondWindow.windows[0]!.resetsAt;
    const inside = recommend({
      task: { model: 'claude-opus-4-6' },
      active: [],
      accounts: [withinWindow],
      now,
    });
    const outside = recommend({
      task: { model: 'claude-opus-4-6' },
      active: [],
      accounts: [beyondWindow],
      now,
    });
    expect(
      inside.ranked[0]?.reasons.some(
        (reason) => reason.code === 'near-limit-stale'
      )
    ).toBe(true);
    expect(
      outside.ranked[0]?.reasons.some(
        (reason) => reason.code === 'near-limit-stale'
      )
    ).toBe(false);
  });

  it('keeps future-dated resetless exhaustion binding instead of treating it as free', () => {
    const future = account(
      'claudeAgent',
      100,
      new Date(now.getTime() + 60 * 60_000).toISOString()
    );
    delete future.windows[0]!.resetsAt;
    const result = recommend({
      task: { model: 'claude-opus-4-6' },
      active: [],
      accounts: [future],
      now,
    });
    expect(result.ranked[0]?.eligible).toBe(false);
    expect(
      result.ranked[0]?.reasons.some(
        (reason) => reason.code === 'near-limit-stale'
      )
    ).toBe(true);
  });

  it('treats a passed reset timestamp as stale instead of imminent', () => {
    const expired = account('codex', 10, now.toISOString());
    const window = expired.windows[0];
    if (window) window.resetsAt = '2026-10-22T00:00:00.000Z';
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [expired],
      now,
    });
    expect(
      result.ranked[0]?.reasons.some(
        (reason) => reason.code === 'reset-expired'
      )
    ).toBe(true);
    expect(
      result.ranked[0]?.reasons.some((reason) => reason.code === 'stale')
    ).toBe(true);
    expect(result.ranked[0]?.score).toBe(18);
  });

  it('requires all reported quota windows to be current', () => {
    const mixed = account('codex', 10, now.toISOString());
    mixed.windows = [
      {
        kind: 'short',
        usedPercent: 0,
        resetsAt: '2026-10-22T00:00:00.000Z',
        source: 'fixture',
        observedAt: now.toISOString(),
        authoritative: true,
      },
      {
        kind: 'long',
        usedPercent: 50,
        resetsAt: '2026-10-23T01:00:00.000Z',
        source: 'fixture',
        observedAt: now.toISOString(),
        authoritative: true,
      },
    ];
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [mixed],
      now,
    });
    expect(result.ranked[0]?.eligible).toBe(false);
    expect(result.ranked[0]?.state).toBe('UNKNOWN');
    expect(result.ranked[0]?.score).toBe(46);
    expect(
      result.ranked[0]?.reasons.some((reason) => reason.code === 'stale')
    ).toBe(true);
  });

  it('keeps the configured orchestrator reserve and respects active concurrency', () => {
    const orchestrator = account('claude_hehe', 20);
    const result = recommend({
      task: { provider: 'claude' },
      active: [{ instanceId: 'claude_hehe', count: 1 }],
      accounts: [orchestrator],
      now,
    });
    expect(result.selected).toHaveLength(0);
    expect(result.ranked[0]?.eligible).toBe(false);
    const lowHeadroom = recommend({
      task: { provider: 'claude' },
      active: [],
      accounts: [account('claude_hehe', 85)],
      now,
    });
    expect(lowHeadroom.ranked[0]?.eligible).toBe(false);
    const unknownQuota = recommend({
      task: { provider: 'claude' },
      active: [],
      accounts: [{ ...orchestrator, windows: [] }],
      now,
    });
    expect(unknownQuota.ranked[0]?.eligible).toBe(false);
    expect(
      unknownQuota.ranked[0]?.reasons.some(
        (reason) => reason.code === 'reserve-unknown'
      )
    ).toBe(true);
  });

  it('does not invent a zero-percent reserve for pools with no configured reserve', () => {
    const unknown = { ...account('codex_unreserved', 20), windows: [] };
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [unknown],
      now,
    });
    expect(result.ranked[0]?.state).toBe('UNKNOWN');
    expect(
      result.ranked[0]?.reasons.some(
        (reason) => reason.code === 'reserve-unknown'
      )
    ).toBe(false);
  });

  it('uses stable instance ids to break equal-score ties', () => {
    const result = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [account('codex_z', 50), account('codex_a', 50)],
      now,
    });
    expect(result.ranked.map((item) => item.instanceId)).toEqual([
      'codex_a',
      'codex_z',
    ]);
  });

  it('orders UNKNOWN pools by bounded signal diagnostic and ignores elapsed resets', () => {
    const at = new Date('2026-10-23T20:52:25.000Z');
    const unknownPool = (
      instanceId: string,
      usedPercent: number,
      resetsAt: string
    ): AccountUsage => ({
      instanceId,
      provider: 'claude',
      label: instanceId,
      models: ['claude-opus-5-5'],
      windows: [
        {
          id: 'five_hour',
          kind: 'short',
          usedPercent,
          observedAt: '2026-10-23T20:30:00.000Z',
          resetsAt,
          source: 'sanitized ordering fixture',
          authoritative: true,
        },
      ],
    });
    const result = recommend({
      accounts: [
        unknownPool('claudeAgent', 80, '2026-10-23T23:00:00Z'),
        unknownPool('claude_kv', 20, '2026-10-23T23:00:00Z'),
        unknownPool('claude_dd', 10, '2026-10-23T20:00:00Z'),
      ],
      active: [],
      task: { model: 'claude-opus-5-5' },
      now: at,
    });
    expect(result.ranked.map((item) => item.instanceId)).toEqual([
      'claude_kv',
      'claudeAgent',
      'claude_dd',
    ]);
    expect(
      result.ranked.map((item) => item.signalOrderRemainingPercent)
    ).toEqual([80, 20, null]);
    expect(result.ranked.every((item) => item.state === 'UNKNOWN')).toBe(true);
  });
});
