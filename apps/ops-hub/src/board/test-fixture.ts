import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, vi } from 'vitest';
import { changeDelegation, changeStop } from './admin';
import type { Identity, Job } from './contracts';
import { Followups } from './followups';
import { Leases } from './leases';
import { Store } from './store';
import { Tasks } from './tasks';

export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const name = `board:${id(1)}:${id(2)}`;
export const project = id(3);
export const task = id(4);
export const now = 1_800_000_000_000;
export const manager: Identity = {
  kid: 'a',
  aud: 'test:https://board.invalid',
  workspaceId: id(1),
  boardId: id(2),
  actor: `user:${id(5)}`,
  userId: id(5),
  manager: true,
  agentActive: false,
  issuedAt: now,
  expiresAt: now + 60_000,
};
export const agent: Identity = {
  ...manager,
  actor: 'agent:iris',
  manager: false,
  agentActive: true,
};
let db: DatabaseSync;
export let store: Store;
export let leases: Leases;
export let followups: Followups;
export let tasks: Tasks;
export const setAlarm = vi.fn(async () => {});
export const send = vi.fn(async () => {});
export const transport = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.stubGlobal('fetch', transport);
  db = new DatabaseSync(':memory:');
  const storage = {
    sql: {
      exec(query: string, ...args: SqlStorageValue[]) {
        if (!args.length && query.includes('CREATE TABLE')) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const statement = db.prepare(query);
        const values = args.map((arg) =>
          arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg
        );
        if (statement.columns().length) {
          const rows = statement.all(...values);
          return { toArray: () => rows };
        }
        const result = statement.run(...values);
        return { toArray: () => [], rowsWritten: Number(result.changes) };
      },
    },
    transactionSync<T>(fn: () => T) {
      db.exec('BEGIN');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    setAlarm,
  };
  store = new Store(storage as unknown as DurableObjectStorage);
  tasks = new Tasks(
    store,
    {
      BOARD_TASKS_SCOPE: name,
      BOARD_TASKS_TOKEN: 'fixture',
      BOARD_TASKS_ORIGIN: 'https://tasks.invalid',
    } as Env,
    name
  );
  leases = new Leases(store, tasks, 'fixture-state-key-0000000000000000000');
  followups = new Followups(store, tasks, leases, {
    send,
  } as unknown as Queue<Job>);
  store.run(
    'INSERT INTO channels VALUES(?,?,?,?,?)',
    project,
    'security/desk',
    'restricted',
    now,
    manager.actor
  );
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

export function enableAndDelegate() {
  store.tx(() => {
    changeStop(
      store,
      manager,
      { stopped: false, expectedGeneration: 0 },
      id(11)
    );
    changeDelegation(
      store,
      manager,
      'iris',
      agent.userId,
      { expiresAt: now + 100_000 },
      id(12),
      now,
      false
    );
    store.run(
      'INSERT INTO grants VALUES(?,?,?,?,?,NULL)',
      project,
      agent.actor,
      'operator',
      manager.actor,
      now
    );
  });
}
