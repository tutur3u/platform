import { expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn() }));
vi.mock('../src/collectors/claude', () => ({ collectClaude: spies.claude }));
vi.mock('../src/collectors/codex', () => ({ collectCodex: spies.codex }));
vi.mock('../src/collectors/t3', () => ({
  collectT3State: () => ({ activeAssignments: [] }),
}));
vi.mock('../src/block-ledger', async (original) => ({
  ...(await original<typeof import('../src/block-ledger')>()),
  readBlockLedger: async () => ({
    version: 1,
    blocks: [
      {
        pool: 'claude_mira',
        modelScope: '*',
        reason: 'limit',
        observedAt: '2026-01-01T00:00:00Z',
        resetAt: '2099-01-01T00:00:00Z',
      },
    ],
  }),
}));
vi.mock('../src/collectors/snapshot', () => ({
  collectSnapshot: async (account: Record<string, unknown>) => ({
    ...account,
    accountIdentityHash: 'shared-fixture',
  }),
}));

import { collectAll } from '../src/collectors';

it('never probes a blocked pool or a detected account alias', async () => {
  const catalog = {
    providers: ['claude_mira', 'claude_kv'].map((providerInstanceId) => ({
      providerInstanceId,
      driverKind: 'claudeAgent',
      displayName: providerInstanceId,
      canRunChildTask: true,
      models: [{ id: 'model' }],
    })),
  };
  const result = await collectAll({ catalog });
  expect(result.accounts).toHaveLength(2);
  expect(spies.claude).not.toHaveBeenCalled();
  expect(spies.codex).not.toHaveBeenCalled();
});
