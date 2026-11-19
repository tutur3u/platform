import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeDelegation, changeStop, parse } from './admin';
import { messages, type Job, type Identity } from './contracts';
import { Followups } from './followups';
import { Leases } from './leases';
import { schedule } from './schedule';
import { Store } from './store';
import { Tasks } from './tasks';
import { Writes } from './writes';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const name = `board:${id(1)}:${id(2)}`;
const project = id(3);
const task = id(4);
const now = 1_800_000_000_000;
const manager: Identity = {
  kid: 'a',
  workspaceId: id(1),
  boardId: id(2),
  actor: `user:${id(5)}`,
  userId: id(5),
  manager: true,
  agentActive: false,
  issuedAt: now,
  expiresAt: now + 60_000,
};
const agent: Identity = {
  ...manager,
  actor: 'agent:iris',
  manager: false,
  agentActive: true,
};
let db: DatabaseSync;
let store: Store;
let leases: Leases;
let followups: Followups;
let tasks: Tasks;
const setAlarm = vi.fn(async () => {});
const send = vi.fn(async () => {});
const transport = vi.fn<typeof fetch>();

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
        const rows = db
          .prepare(query)
          .all(
            ...args.map((arg) =>
              arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg
            )
          );
        return { toArray: () => rows };
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

function enableAndDelegate() {
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

const prepared = {
  taskId: task,
  asOf: now,
  fence: 1,
  token: 'fixture',
  tokenHash: 'fixture-hash',
};

describe('Fleet Board SQLite', () => {
  it('admits a single claim for a raced preparation and audits expiry once', () => {
    enableAndDelegate();
    const attempt = () =>
      store.tx(() =>
        leases.claim(agent, project, id(10), 30_000, prepared, 1, now)
      );
    expect(attempt()).toMatchObject({ taskId: task, fence: 1 });
    expect(attempt).toThrow('state_conflict');
    expect(() =>
      store.tx(() =>
        leases.change(
          agent,
          project,
          task,
          prepared.tokenHash,
          id(14),
          now + 30_000,
          60_000
        )
      )
    ).toThrow('lease_lost');
    store.tx(() => {
      leases.expire(now + 30_000);
      leases.expire(now + 30_000);
    });
    expect(
      store
        .rows('SELECT action FROM audit ORDER BY seq')
        .map((row) => row.action)
    ).toEqual([
      'board.stop_changed',
      'delegation.changed',
      'lease.claimed',
      'lease.expired',
    ]);
  });

  it('fails closed without live delegation and applies revocation at use time', () => {
    expect(() => store.tx(() => store.admit(agent, now))).toThrow('forbidden');
    enableAndDelegate();
    expect(() =>
      store.tx(() => store.admit({ ...agent, agentActive: false }, now))
    ).toThrow('forbidden');
    expect(() => store.tx(() => store.admit(agent, now + 100_000))).toThrow(
      'forbidden'
    );
    store.tx(() =>
      changeDelegation(
        store,
        manager,
        'iris',
        agent.userId,
        {},
        id(15),
        now,
        true
      )
    );
    expect(() =>
      store.tx(() =>
        leases.claim(agent, project, id(16), 30_000, prepared, 1, now)
      )
    ).toThrow('forbidden');
    expect(
      store.rows('SELECT action FROM audit ORDER BY seq').at(-1)
    ).toMatchObject({ action: 'delegation.revoked' });
  });

  it('does not allow another delegate of the same agent to take over a lease', async () => {
    enableAndDelegate();
    const other = { ...agent, userId: id(20) };
    store.tx(() => {
      changeDelegation(
        store,
        manager,
        'iris',
        other.userId,
        { expiresAt: now + 90_000 },
        id(21),
        now,
        false
      );
      leases.claim(agent, project, id(10), 30_000, prepared, 1, now);
    });
    expect(await leases.token(agent, task, id(10), 1)).not.toBe(
      await leases.token(other, task, id(10), 1)
    );
    expect(() =>
      store.tx(() =>
        leases.change(other, project, task, prepared.tokenHash, id(22), now)
      )
    ).toThrow('lease_lost');
  });

  it('does not expose security channels to managers without a content grant', () => {
    expect(() =>
      store.tx(() => store.require(project, manager, 'reader', now))
    ).toThrow('not_found');
  });

  it('rejects unknown message versions and untyped fields', () => {
    expect(() =>
      parse(
        messages,
        { schema: 'note', schemaVersion: 2, body: { text: 'test' } },
        'invalid_schema'
      )
    ).toThrow('invalid_schema');
    expect(() =>
      parse(
        messages,
        { schema: 'note', schemaVersion: 1, body: { text: 'test', extra: 1 } },
        'invalid_schema'
      )
    ).toThrow('invalid_schema');
  });

  it('starts no outbound work while stopped and ignores stale queue generations', async () => {
    await expect(tasks.candidates(manager, 0, project)).rejects.toThrow(
      'board_stopped'
    );
    await followups.alarm(name);
    await schedule(store);
    await followups.consume({
      workspaceId: id(1),
      boardId: id(2),
      id: id(19),
      generation: 0,
      attempt: 1,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
    expect(store.control().adapter_calls).toBe(0);
  });

  it('does not deliver a stale queued attempt after the board resumes', async () => {
    enableAndDelegate();
    store.tx(() => {
      changeStop(
        store,
        manager,
        { stopped: true, expectedGeneration: 1 },
        id(50)
      );
      changeStop(
        store,
        manager,
        { stopped: false, expectedGeneration: 2 },
        id(51)
      );
      store.run(
        `INSERT INTO followups VALUES(?,?,?,?,?,?,NULL,'verify_task','{"expected":"done"}',1,'queued',1,?,?,?,NULL)`,
        id(52),
        task,
        project,
        agent.actor,
        agent.userId,
        now,
        now + 120_000,
        now,
        now
      );
    });
    await followups.consume({
      workspaceId: id(1),
      boardId: id(2),
      id: id(52),
      attempt: 1,
      generation: 1,
    });
    expect(followups.get(id(52))?.state).toBe('queued');
    expect(transport).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
    expect(store.control().adapter_calls).toBe(0);
  });

  it('rejects an unverified T3 recipient and terminally fails unsupported notifications', async () => {
    enableAndDelegate();
    const writes = new Writes(store, tasks, leases, followups);
    await expect(
      writes.fetch('POST', ['watchers'], {
        actor: agent,
        json: {
          channelId: project,
          eventMask: 1,
          target: { kind: 't3_thread', ref: 'unregistered' },
        },
        idempotency: id(40),
        fingerprint: 'fixture',
        url: new URL('https://board.invalid/board/watchers'),
      })
    ).rejects.toThrow('adapter_unavailable');
    store.tx(() => {
      store.run(
        `INSERT INTO followups VALUES(?,?,?,?,?,?,NULL,'notify','{}',1,'queued',1,?,?,?,NULL)`,
        id(41),
        task,
        project,
        agent.actor,
        agent.userId,
        now,
        now + 120_000,
        now,
        now
      );
    });
    await followups.consume({
      workspaceId: id(1),
      boardId: id(2),
      id: id(41),
      attempt: 1,
      generation: 1,
    });
    expect(followups.get(id(41))).toMatchObject({
      state: 'failed',
      terminal_code: 'adapter_unavailable',
    });
    expect(transport).not.toHaveBeenCalled();
    expect(store.control().adapter_calls).toBe(0);
  });

  it('binds candidate reads to the object name rather than the caller board', async () => {
    enableAndDelegate();
    transport.mockResolvedValueOnce(
      Response.json({ asOf: now, candidates: [], nextCursor: null })
    );
    await tasks.candidates(
      { ...agent, workspaceId: id(70), boardId: id(71) },
      1,
      project
    );
    const [url] = transport.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      `/workspaces/${id(1)}/boards/${id(2)}/fleet/candidates?`
    );
  });
});
