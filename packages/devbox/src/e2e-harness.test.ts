import { describe, expect, it } from 'vitest';
import { createDevboxHarness } from './e2e-harness';

describe('devbox fake broker/agent e2e harness', () => {
  it('auto-leases, syncs dirty files, runs a remote Bun command, and auto-releases', async () => {
    const harness = createDevboxHarness();

    const result = await harness.run({
      command: ['bun', 'check'],
      files: {
        'packages/sdk/src/cli/devbox.ts': 'export const synced = true;',
        'untracked-note.md': 'dirty uncommitted change',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain('remote$ bun check');
    expect(result.remoteFiles['untracked-note.md']).toBe(
      'dirty uncommitted change'
    );
    expect(harness.getLease(result.leaseId)?.status).toBe('released');
  });

  it('keeps reusable leases warm and updates env for later commands', async () => {
    const harness = createDevboxHarness();
    const first = await harness.run({
      command: ['bun', 'sb:start'],
      env: { DATABASE_URL: 'postgres://secret' },
      keep: true,
    });

    harness.updateEnv(first.leaseId, { API_TOKEN: 'token-1' });
    const second = await harness.run({
      command: ['bun', 'test:e2e'],
      leaseId: first.leaseId,
      logs: ['DATABASE_URL=postgres://secret API_TOKEN=token-1'],
    });

    expect(first.leaseId).toBe(second.leaseId);
    expect(harness.getLease(first.leaseId)?.status).toBe('active');
    expect(second.logs).toContain(
      'DATABASE_URL=[REDACTED] API_TOKEN=[REDACTED]'
    );
  });

  it('rejects blocked commands and evicts legacy Bun caches', async () => {
    const harness = createDevboxHarness();

    expect(() => harness.runSync({ command: ['rm', '-rf', '/'] })).toThrow(
      'blocked'
    );

    harness.seedCaches([
      {
        bunVersion: '1.2.0',
        cacheSchemaVersion: 1,
        commandProfile: 'bun-check',
        key: 'legacy-bun',
        lastUsedAt: '2026-06-01T00:00:00.000Z',
        lockfileHash: 'lock-a',
        sizeBytes: 100,
        type: 'bun-install',
      },
    ]);

    expect(harness.pruneCaches().evict.map((entry) => entry.key)).toEqual([
      'legacy-bun',
    ]);
  });
});
