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

it('blocks positional admission for a stale near-limit window with a future reset', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  fixture.blocked = false;
  const now = new Date('2026-10-23T08:00:00Z');
  fixture.collect.mockResolvedValue({
    accounts: [
      {
        instanceId: 'claudeAgent',
        provider: 'claude',
        label: 'claudeAgent',
        available: true,
        models: ['claude-opus-4-6'],
        windows: [
          {
            kind: 'weekly',
            label: 'Weekly limit',
            scope: { kind: 'account' },
            usedPercent: 95,
            source: 'sanitized-fixture',
            authoritative: true,
            observedAt: '2026-10-20T08:00:00Z',
            resetsAt: '2026-10-26T08:00:00Z',
          },
        ],
      },
    ],
    blocks: [],
    active: [],
    t3ObservedAt: now.toISOString(),
  });
  try {
    await runPositionalAdmit(['claudeAgent', 'claude-opus-4-6'], undefined, {
      now: () => now,
    });
    expect(process.exitCode).toBe(3);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).reasons).toContain(
      'pool-near-or-exhausted'
    );
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

it('reads the clock again after acquiring the ledger transaction before pacing and reservation', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  const initial = new Date('2026-10-23T01:00:00Z');
  const inside = new Date(initial.getTime() + 1000);
  const observed = vi.fn().mockReturnValueOnce(initial).mockReturnValue(inside);
  const pool = {
    instanceId: 'claude_mira',
    provider: 'claude' as const,
    label: 'fixture',
    available: true,
    models: ['claude-opus-4-6'],
    windows: [
      {
        kind: 'short' as const,
        usedPercent: 20,
        authoritative: true,
        observedAt: initial.toISOString(),
        resetsAt: new Date(inside.getTime() + 60 * 60_000).toISOString(),
        source: 'fixture',
      },
    ],
  };
  fixture.blocked = false;
  fixture.collect.mockResolvedValue({
    accounts: [pool],
    blocks: [],
    active: [],
    t3ObservedAt: initial.toISOString(),
    poolSettings: {
      claude_mira: {
        reservePercent: 0,
        nearUsedPercent: 90,
        hysteresisPercent: 0,
        pacingMs: 0,
        maxConcurrent: 2,
        preference: 0,
      },
    },
  });
  let transactionLedger: Record<string, unknown> | undefined;
  fixture.transaction.mockImplementation(
    (operation: (ledger: Record<string, unknown>) => unknown) => {
      transactionLedger = {
        version: 1,
        observations: [],
        reservations: [],
        leases: [],
        leaseHistory: [],
        lastAdmissions: { claude_mira: initial.getTime() + 500 },
      };
      return operation(transactionLedger);
    }
  );
  try {
    await runPositionalAdmit(['claude_mira', 'claude-opus-4-6'], () => '', {
      now: observed,
      collectPoolReceipts: () => ({
        threads: [],
        runs: [],
        tasks: [],
        failures: [],
        transfers: [],
      }),
    });
    const output = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(observed).toHaveBeenCalledTimes(2);
    expect(output.status).toBe('ADMIT');
    expect(fixture.transaction.mock.calls.length).toBeGreaterThan(0);
    expect(
      (
        transactionLedger?.reservations as
          | Array<{ createdAt: string }>
          | undefined
      )?.[0]?.createdAt
    ).toBe(inside.toISOString());
  } finally {
    fixture.blocked = true;
    process.exitCode = previous;
    log.mockRestore();
  }
});
