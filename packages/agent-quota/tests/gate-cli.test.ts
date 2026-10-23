import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ blocked: true, collect: vi.fn() }));
vi.mock('../src/block-ledger', async (original) => ({
  ...(await original<typeof import('../src/block-ledger')>()),
  readBlockLedger: async () => ({
    version: 1,
    blocks: fixture.blocked
      ? [
          {
            pool: 'antigravity',
            modelScope: 'gemini-4-argon-*',
            reason: 'limit',
            observedAt: '2026-01-01T00:00:00Z',
            resetAt: '2099-01-01T00:00:00Z',
          },
        ]
      : [],
  }),
}));
vi.mock('../src/collectors', () => ({ collectAll: fixture.collect }));
vi.mock('../src/hook-ledger', async (original) => ({
  ...(await original<typeof import('../src/hook-ledger')>()),
  readLedger: async () => ({
    version: 1,
    observations: [],
    reservations: [],
    leases: [],
    leaseHistory: [],
  }),
}));

import { runPositionalAdmit } from '../src/positional-admit';

it('sets exit 3 and never collects or probes for a hard-blocked request', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  try {
    fixture.blocked = true;
    await runPositionalAdmit(['antigravity', 'gemini-4-argon-high']);
    expect(process.exitCode).toBe(3);
    expect(fixture.collect).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain('observed-block-ledger');
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});
it('sets exit 0 for an unblocked healthy pool, but exit 3 when owner reserve is unmet', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  try {
    fixture.blocked = false;
    const now = new Date().toISOString();
    fixture.collect.mockResolvedValue({
      accounts: [
        {
          instanceId: 'codex',
          provider: 'codex',
          label: 'codex',
          available: true,
          models: ['gpt-model'],
          windows: [
            {
              kind: 'short',
              usedPercent: 75,
              source: 'fixture',
              authoritative: true,
              observedAt: now,
              resetsAt: '2099-01-01T00:00:00Z',
            },
          ],
        },
      ],
      blocks: [],
      active: [],
      t3ObservedAt: now,
    });
    await runPositionalAdmit(['codex', 'gpt-model']);
    expect(process.exitCode).toBe(0);
    await runPositionalAdmit(['codex', 'gpt-model', '--reserve-owner']);
    expect(process.exitCode).toBe(3);
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});
