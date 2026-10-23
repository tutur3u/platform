import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { processStartedAt } from '../src/process-identity';

const fixture = vi.hoisted(() => ({
  input: {} as Record<string, unknown>,
  accounts: [] as unknown[],
  snapshot: {} as Record<string, unknown>,
}));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) =>
      args[0] === 0 ? JSON.stringify(fixture.input) : fs.readFileSync(...args),
  };
});
vi.mock('../src/collectors', () => ({
  collectAll: async () => ({ accounts: fixture.accounts, active: [] }),
}));
vi.mock('../src/collectors/children', () => ({
  collectChildren: vi.fn(() => fixture.snapshot),
  collectPoolReceipts: vi.fn(() => fixture.snapshot),
}));

import { collectChildren } from '../src/collectors/children';
import { runHook } from '../src/hook-cli';

it('plain admit automatically imports completed receipts and never prints account identity keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-hook-home-'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const now = new Date().toISOString();
    fixture.accounts = ['owner', 'antigravity', 'codex'].map((instanceId) => ({
      instanceId,
      provider: instanceId === 'owner' ? 'claude' : instanceId,
      label: instanceId,
      available: true,
      accountIdentityHash: instanceId.padEnd(64, '0'),
      models: ['model'],
      windows: [
        {
          kind: 'short',
          usedPercent: 0,
          authoritative: true,
          source: 'fixture',
          observedAt: now,
          resetsAt: new Date(Date.now() + 86400_000).toISOString(),
        },
      ],
    }));
    fixture.snapshot = {
      threads: [],
      tasks: [],
      transfers: [],
      runs: [
        {
          id: 'run',
          threadId: 'child',
          status: 'completed',
          instanceId: 'antigravity',
          model: 'model',
          rootNodeId: 'node',
        },
      ],
      failures: [
        {
          runId: 'run',
          nodeId: 'node',
          message: 'Usage Limit Reached reset in 6 days, 23 hours',
          observedAt: now,
        },
      ],
    };
    fixture.input = {
      requestId: 'request',
      threadId: 'parent',
      currentInstanceId: 'owner',
      requirements: {
        capability: 'implementation',
        authorizedInstanceIds: ['antigravity', 'codex'],
        privacyApprovedInstanceIds: ['antigravity', 'codex'],
        candidates: ['antigravity', 'codex'].map((instanceId) => ({
          instanceId,
          model: 'model',
          capabilities: ['implementation'],
        })),
      },
      policy: {
        orchestratorReservePercent: 30,
        nearUsedPercent: 90,
        unknownMaxConcurrent: 1,
      },
    };
    await runHook('admit', undefined, dir);
    expect(
      log.mock.calls.map((call) => String(call[0])).join('')
    ).not.toContain('codex'.padEnd(64, '0'));
    expect(collectChildren).toHaveBeenCalledWith('parent');
    const result = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(result).toMatchObject({ chosen: { providerInstanceId: 'codex' } });
    expect(
      result.pools.find((pool: { pool: string }) => pool.pool === 'antigravity')
    ).toMatchObject({ state: 'EXHAUSTED' });
    await runHook('admit', undefined, dir);
    const replay = String(log.mock.calls.at(-1)?.[0]);
    expect(replay).toContain('admission-already-reserved');
    expect(replay).not.toContain('accountKey');
    expect(replay).not.toContain('codex'.padEnd(64, '0'));
  } finally {
    log.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});

it('redacts the account fingerprint in switch-lease stdout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-redaction-'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    fixture.accounts = [
      {
        instanceId: 'codex',
        provider: 'codex',
        label: 'fixture',
        windows: [],
        accountIdentityHash: 'a'.repeat(64),
      },
    ];
    fixture.input = {
      instanceId: 'codex',
      threadId: 'thread',
      attemptId: 'attempt',
      pid: process.pid,
      processStartedAt: processStartedAt(process.pid),
      ttlMs: 1000,
    };
    await runHook('switch-lease', 'acquire', dir);
    const output = String(log.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(output).status).toBe('acquired');
    expect(output).not.toContain('accountKey');
    expect(output).not.toContain('a'.repeat(64));
  } finally {
    log.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});
