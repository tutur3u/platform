import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  blocked: true,
  collect: vi.fn(),
  receipts: vi.fn(),
  transaction: vi.fn(),
}));
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
vi.mock('../src/collectors/children', () => ({
  collectPoolReceipts: fixture.receipts,
}));
vi.mock('../src/hook-ledger', async (original) => ({
  ...(await original<typeof import('../src/hook-ledger')>()),
  transactLedger: fixture.transaction,
}));
fixture.receipts.mockImplementation(() => ({
  threads: [],
  runs: [],
  tasks: [],
  failures: [],
  transfers: [],
}));
fixture.transaction.mockImplementation(
  (operation: (ledger: unknown) => unknown) =>
    operation({
      version: 1,
      observations: [],
      reservations: [],
      leases: [],
      leaseHistory: [],
    })
);
vi.mock('../src/collectors', () => ({ collectAll: fixture.collect }));

import { HookError } from '../src/hook-ledger';
import { parseCatalogStdin, runPositionalAdmit } from '../src/positional-admit';

it('accepts structured live catalogs through the positional admit stdin parser', () => {
  expect(parseCatalogStdin('{"instances":[{"id":"claude_dd"}]}')).toEqual({
    instances: [{ id: 'claude_dd' }],
  });
});
it('accepts --catalog-stdin and passes the supplied catalog to collection', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  fixture.blocked = false;
  fixture.collect.mockResolvedValue({
    accounts: [],
    blocks: [],
    active: [],
    t3ObservedAt: new Date().toISOString(),
  });
  try {
    await runPositionalAdmit(
      ['codex', 'gpt-model', '--catalog-stdin'],
      () => '{"instances":[]}'
    );
    expect(fixture.collect).toHaveBeenCalledWith({
      snapshotsOnly: true,
      catalog: { instances: [] },
    });
    expect(process.exitCode).toBe(2);
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});

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
    expect(fixture.receipts.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.transaction.mock.invocationCallOrder[0]!
    );
    await runPositionalAdmit(['codex', 'gpt-model', '--reserve-owner']);
    expect(process.exitCode).toBe(3);
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});

it('returns malformed/fail-closed exit 2, distinct from policy blocks', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  try {
    await runPositionalAdmit(['codex']);
    expect(process.exitCode).toBe(2);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(
      'admit-pool-model-invalid'
    );
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});
it('returns exit 3 for retryable ledger contention', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  try {
    fixture.blocked = false;
    fixture.collect.mockResolvedValue({
      accounts: [
        {
          instanceId: 'codex',
          provider: 'codex',
          label: 'codex',
          available: true,
          models: ['gpt-model'],
          windows: [],
        },
      ],
      blocks: [],
      active: [],
      t3ObservedAt: new Date().toISOString(),
    });
    fixture.transaction.mockRejectedValue(
      new HookError('ledger-contention-retry')
    );
    await runPositionalAdmit(['codex', 'gpt-model']);
    expect(process.exitCode).toBe(3);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(
      'ledger-contention-retry'
    );
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).retryable).toBe(true);
  } finally {
    process.exitCode = previous;
    fixture.transaction.mockImplementation(
      (operation: (ledger: unknown) => unknown) =>
        operation({
          version: 1,
          observations: [],
          reservations: [],
          leases: [],
          leaseHistory: [],
        })
    );
    log.mockRestore();
  }
});
