import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { DueJob } from './contracts';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import { createProactiveAdapter } from './object';

it('inactive adapter denies authority and has no alarm after synthetic calls/restart', async () => {
  const db = new DatabaseSync(':memory:');
  let alarm: number | null = null;
  const storage = {
    sql: {
      exec(query: string, ...values: (string | number | null)[]) {
        const rows = db.prepare(query).all(...values);
        return { toArray: () => rows };
      },
    },
    transactionSync<T>(operation: () => T): T {
      db.exec('BEGIN');
      try {
        const value = operation();
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async setAlarm(at: number) {
      alarm = at;
    },
    async deleteAlarm() {
      alarm = null;
    },
  };
  try {
    const adapter = createProactiveAdapter(storage, undefined, () => 100);
    const job: DueJob = {
      actorId: 'a',
      workspaceId: 'w',
      occurrenceId: 'o',
      dueAt: 100,
      expiresAt: 200,
      sourceVersion: '1',
      consentVersion: '1',
      action: 'reflection-dry-run',
    };
    expect(await adapter.submit(job)).toEqual({
      kind: 'denied',
      reason: 'authority-unqualified',
    });
    await adapter.alarm();
    expect(alarm).toBeNull();
    expect(adapter.inspect()).toEqual({ due: null, review: null });
    const recovered = createProactiveAdapter(storage, undefined, () => 100);
    expect(await recovered.cancel(job)).toEqual({
      kind: 'denied',
      reason: 'missing-job',
    });
    expect(recovered.inspect()).toEqual({ due: null, review: null });
    expect(alarm).toBeNull();
  } finally {
    db.close();
  }
});
