import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readLedger, transactLedger } from '../src/hook-ledger';
import { processStartedAt } from '../src/process-identity';
import { acquireSwitchLease } from '../src/switch-safety';

const now = new Date();
// Not a real pid: a hard-coded low pid can be a live system process on the host.
const DEAD_PID = 2147483647;
const lease = {
  threadId: 'owner',
  accountKey: 'codex:one',
  attemptId: 'first',
  pid: DEAD_PID,
  processStartedAt: '2026-10-23T00:00:00Z',
  ttlMs: 30_000,
};
describe('atomic host-wide hook ledger', () => {
  it('admits exactly one concurrent transition on the same thread with different targets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const result = await Promise.allSettled([
        transactLedger((value) => acquireSwitchLease(value, lease, now), dir),
        transactLedger(
          (value) =>
            acquireSwitchLease(
              value,
              { ...lease, accountKey: 'claude:two', attemptId: 'second' },
              now
            ),
          dir
        ),
      ]);
      expect(
        result.filter(
          (item) =>
            item.status === 'fulfilled' && item.value.status === 'acquired'
        )
      ).toHaveLength(1);
      expect((await readLedger(dir)).leases).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('allows two thread leases on a shared account and persists expired takeover', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      await transactLedger(
        (value) => acquireSwitchLease(value, lease, now),
        dir
      );
      await transactLedger(
        (value) =>
          acquireSwitchLease(
            value,
            { ...lease, threadId: 'upskii', attemptId: 'other-owner' },
            now
          ),
        dir
      );
      expect((await readLedger(dir)).leases).toHaveLength(2);
      const result = await transactLedger(
        (value) =>
          acquireSwitchLease(
            value,
            { ...lease, attemptId: 'replacement' },
            new Date(now.getTime() + 30_001)
          ),
        dir
      );
      expect(result.status).toBe('acquired');
      expect(
        (await readLedger(dir)).leaseHistory.some(
          (event) => event.action === 'expired-takeover'
        )
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('waits briefly for a live short transaction instead of returning malformed-state failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const first = transactLedger(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        value.lastAdmissions = { first: 1 };
      }, dir);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = transactLedger((value) => {
        value.lastAdmissions = { second: 2 };
      }, dir);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
      expect((await readLedger(dir)).lastAdmissions).toEqual({ second: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('serializes three independent processes through lock create/open races', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-processes-'));
    let packageRoot = dirname(fileURLToPath(import.meta.url));
    while (!existsSync(resolve(packageRoot, 'src/hook-ledger.ts'))) {
      const parent = dirname(packageRoot);
      if (parent === packageRoot) throw Error('quota package source not found');
      packageRoot = parent;
    }
    const moduleUrl = pathToFileURL(
      resolve(packageRoot, 'src/hook-ledger.ts')
    ).href;
    const script = `import { transactLedger } from ${JSON.stringify(moduleUrl)};
const [directory, key] = process.argv.slice(-2);
await transactLedger(async ledger => {
  await new Promise(resolve => setTimeout(resolve, 80));
  ledger.lastAdmissions ??= {}; ledger.lastAdmissions[key] = Date.now();
}, directory);`;
    try {
      const results = await Promise.all(
        ['one', 'two', 'three', 'four'].map(
          (key) =>
            new Promise<{ code: number | null; stderr: string }>((resolve) => {
              const child = spawn('bun', ['-e', script, dir, key], {
                env: { HOME: dir, PATH: process.env.PATH ?? '' },
                stdio: ['ignore', 'ignore', 'pipe'],
              });
              let stderr = '';
              child.stderr
                .setEncoding('utf8')
                .on('data', (part) => (stderr += part));
              child.on('close', (code) => resolve({ code, stderr }));
            })
        )
      );
      expect(results).toEqual([
        { code: 0, stderr: '' },
        { code: 0, stderr: '' },
        { code: 0, stderr: '' },
        { code: 0, stderr: '' },
      ]);
      expect(
        Object.keys((await readLedger(dir)).lastAdmissions ?? {}).sort()
      ).toEqual(['four', 'one', 'three', 'two']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('returns a retryable contention reason when a live transaction outlasts the bounded wait', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const startedAt = processStartedAt(process.pid);
      if (!startedAt) throw Error('test process identity unavailable');
      await writeFile(
        join(dir, 'transaction.lock'),
        JSON.stringify({
          pid: process.pid,
          processStartedAt: startedAt,
        })
      );
      await expect(transactLedger(() => {}, dir)).rejects.toThrow(
        'ledger-contention-retry'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
