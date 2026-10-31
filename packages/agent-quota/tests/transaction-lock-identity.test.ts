import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({ lookups: vi.fn(), failFirst: 1 }));
vi.mock('../src/process-identity', async (original) => {
  const actual = await original<typeof import('../src/process-identity')>();
  identity.lookups.mockImplementation((pid: number) =>
    identity.lookups.mock.calls.length <= identity.failFirst
      ? undefined
      : actual.processStartedAt(pid)
  );
  return { ...actual, processStartedAt: identity.lookups };
});

const { readLedger, transactLedger } = await import('../src/hook-ledger');

it('treats a transient process-identity failure as retryable and looks up its own start time once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-identity-'));
  try {
    for (const key of ['one', 'two', 'three'])
      await transactLedger((ledger) => {
        ledger.lastAdmissions = { ...ledger.lastAdmissions, [key]: 1 };
      }, dir);
    expect(Object.keys((await readLedger(dir)).lastAdmissions ?? {})).toEqual([
      'one',
      'two',
      'three',
    ]);
    // One failed lookup, one successful lookup; later transactions reuse it.
    expect(identity.lookups).toHaveBeenCalledTimes(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
