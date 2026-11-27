import { expect, it } from 'vitest';
import { pickSeat } from '../src/seat-picker';
import type { AccountUsage } from '../src/types';

it('excludes a recently blocked model despite fresh family headroom', () => {
  const now = new Date('2026-11-27T16:00:00Z');
  const account: AccountUsage = {
    instanceId: 'antigravity_2',
    provider: 'antigravity',
    available: true,
    label: 'Fixture',
    models: ['gemini-4-hydrogen', 'gemini-3.8-flash', 'claude-sonnet-4-6'],
    windows: [
      {
        kind: 'weekly',
        scope: { kind: 'models', modelPrefixes: ['gemini-'] },
        usedPercent: 1,
        resetsAt: '2026-11-28T16:00:00Z',
        windowDurationMins: 10080,
        observedAt: '2026-11-27T15:58:00Z',
        source: 'fixture',
        authoritative: true,
      },
    ],
  };
  const options = {
    accounts: [account],
    active: [],
    task: {},
    now,
    blocks: [
      {
        pool: account.instanceId,
        modelScope: 'gemini-4-hydrogen',
        reason: 'individual-quota',
        observedAt: '2026-11-27T15:59:00Z',
        resetAt: '2026-12-04T16:00:00Z',
      },
    ],
  };
  expect(pickSeat(options, 'builder', 'gemini-', undefined)?.model).toBe(
    'gemini-3.8-flash'
  );
  expect(
    pickSeat(options, 'reviewer', undefined, account.instanceId)
  ).toBeNull();
  expect(
    pickSeat(
      { ...options, now: new Date('2026-11-27T17:00:00Z') },
      'builder',
      undefined,
      undefined
    )
  ).toBeNull();
});
