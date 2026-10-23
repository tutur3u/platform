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
});
