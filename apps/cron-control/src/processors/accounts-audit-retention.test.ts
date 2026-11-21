import { describe, expect, it, vi } from 'vitest';
import { purgeAccountsAudit } from './accounts-audit-retention';
import type { ProcessorContext } from './types';

function fixture(replies: unknown[], fences: boolean[] = []) {
  const calls: Array<{ path: string; limit: number }> = [];
  const context: ProcessorContext = {
    deadline: Date.now() + 60_000,
    now: Date.now,
    env: {
      SUPABASE_URL: 'https://db.example',
      SUPABASE_SECRET_KEY: 'synthetic',
    },
    fetch: async (input, init) => {
      calls.push({
        path: new URL(String(input)).pathname,
        limit: JSON.parse(String(init?.body)).p_limit,
      });
      const reply = replies.shift();
      if (reply === undefined) throw new Error('unexpected RPC');
      return Response.json(reply);
    },
    fence: async () => fences.shift() ?? true,
    pending: {
      add: vi.fn(),
      fail: vi.fn(),
      list: vi.fn(),
      quarantined: vi.fn(),
      settle: vi.fn(),
    },
    target: { url: new URL('https://db.example'), secret: 'synthetic' },
    userAgent: 'cron-test',
  };
  return { calls, context };
}

const full = { deleted: 500, lagging: true, fenced: false };
describe('Accounts audit retention', () => {
  it('reconciles and purges a fixed row budget then alerts on remaining lag', async () => {
    const { context, calls } = fixture([1, full, full, full]);
    const alert = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await purgeAccountsAudit(context)).toEqual({
        outcome: 'ok',
        detail: { deleted: 1500, reconciled: 1, lagging: 1 },
      });
      expect(calls.map(({ path }) => path.split('/').at(-1))).toEqual([
        'accounts_reconcile',
        'accounts_purge',
        'accounts_purge',
        'accounts_purge',
      ]);
      expect(calls.every(({ limit }) => limit === 500)).toBe(true);
      expect(alert).toHaveBeenCalledOnce();
    } finally {
      alert.mockRestore();
    }
  });

  it('rechecks the durable dispatcher fence between writes', async () => {
    const { calls, context } = fixture([0, full], [true, true, false]);
    expect(await purgeAccountsAudit(context)).toMatchObject({
      outcome: 'stopped',
      detail: { deleted: 500 },
    });
    expect(calls).toHaveLength(2);
  });

  it('ends the slot when a committed row count is uncertain', async () => {
    const { calls, context } = fixture([0, { ...full, deleted: 501 }]);
    expect(await purgeAccountsAudit(context)).toMatchObject({
      outcome: 'unknown',
    });
    expect(calls).toHaveLength(2);
  });
});
