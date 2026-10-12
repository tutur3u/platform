import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { unavailableAuthority } from './authority';
import type { DueJob, JobState } from './contracts';
import { DueJobEngine } from './engine';
import { SqliteJobStore } from './sqlite-store';

const job: DueJob = {
  actorId: 'a',
  workspaceId: 'w',
  occurrenceId: 'o',
  sourceVersion: 's',
  consentVersion: 'c',
  dueAt: 100,
  expiresAt: 200,
  action: 'reflection-dry-run',
};
it('actual SQLite reconstructs every phase and retains terminal fences across engine restart', async () => {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(query: string, ...values: (string | number | null)[]) {
      const rows = db.prepare(query).all(...values);
      return { toArray: () => rows };
    },
  };
  const atomic = <T>(operation: () => T): T => {
    db.exec('BEGIN');
    try {
      const value = operation();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  try {
    const store = new SqliteJobStore(sql, atomic);
    for (const phase of [
      { kind: 'pending' },
      { kind: 'leased', token: 'l', until: 150 },
      { kind: 'cancelled', reason: 'user-cancelled' },
      { kind: 'unknown', acceptance: 'accepted' },
      { kind: 'dead-letter', reason: 'offline' },
    ] satisfies JobState['phase'][]) {
      store.transaction(() => store.write({ job, runs: 1, phase }));
      const reopened = new SqliteJobStore(sql, atomic);
      expect(reopened.read()).toEqual({ job, runs: 1, phase });
    }
    store.write({ job, runs: 0, phase: { kind: 'cancelled', reason: 'stop' } });
    const engine = new DueJobEngine(
      new SqliteJobStore(sql, atomic),
      unavailableAuthority,
      () => 110,
      () => 'new'
    );
    await engine.execute();
    expect(store.read()?.phase).toEqual({ kind: 'cancelled', reason: 'stop' });
    expect(() =>
      store.transaction(() => {
        store.write({ job, runs: 1, phase: { kind: 'pending' } });
        throw new Error('crash');
      })
    ).toThrow('crash');
    expect(store.read()?.phase).toEqual({ kind: 'cancelled', reason: 'stop' });
    expect(() =>
      store.write({
        job: { ...job, actorId: 'other' },
        runs: 0,
        phase: { kind: 'pending' },
      })
    ).toThrow('Identity conflict');
    db.exec("UPDATE proactive_job SET phase = 'forged'");
    expect(() => store.read()).toThrow('Corrupt proactive phase');
  } finally {
    db.close();
  }
});
