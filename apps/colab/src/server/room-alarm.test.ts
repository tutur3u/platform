import { DatabaseSync } from 'node:sqlite';
import { createRoom, type Room } from '@tuturuuu/multiplayer';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      protected ctx: DurableObjectState,
      protected env: unknown
    ) {}
  },
}));
vi.mock('./ai', () => ({}));

import type { Env } from './env';
import { ColabRoom } from './room';

const databases: DatabaseSync[] = [];
const start = 1_800_000_000_000;
const deadline = start + 300_000;
function fixture(mode: Room['mode'] = 'open') {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  let writes = 0;
  let reads = 0;
  let failMarker = false;
  const setAlarm = vi.fn();
  const ctx = {
    getWebSockets: () => [],
    storage: {
      setAlarm,
      sql: {
        exec(query: string, ...args: (string | number)[]) {
          if (query.startsWith('SELECT')) reads++;
          if (query.startsWith('INSERT')) {
            writes++;
            if (failMarker && query.includes('VALUES(3,'))
              throw new Error('marker write unavailable');
          }
          const rows = db.prepare(query).all(...args);
          return { toArray: () => rows };
        },
      },
      transactionSync(fn: () => void) {
        db.exec('BEGIN');
        try {
          fn();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  } as unknown as DurableObjectState;
  const instance = () => new ColabRoom(ctx, {} as Env);
  const object = instance();
  const room = createRoom(
    'expiry-fixture',
    { id: 'host', email: 'host@tuturuuu.com', name: 'Host', expires: deadline },
    {
      title: 'Fixture',
      startsAt: null,
      endsAt: deadline,
      teamCount: 1,
      maxUsers: 10,
    },
    start
  );
  room.mode = mode;
  function seed(value: Room) {
    db.prepare('INSERT OR REPLACE INTO state VALUES(1, ?)').run(
      JSON.stringify(value)
    );
  }
  seed(room);
  const state = () =>
    JSON.parse(
      (
        db.prepare('SELECT value FROM state WHERE id = 1').get() as {
          value: string;
        }
      ).value
    ) as Room;
  const audit = () => {
    const row = db.prepare('SELECT value FROM state WHERE id = 2').get() as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as NonNullable<Room['audit']>) : [];
  };
  return {
    object,
    instance,
    state,
    audit,
    seed,
    setAlarm,
    counters: () => ({ writes, reads }),
    failMarker: (value: boolean) => {
      failMarker = value;
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});

it.each(['open', 'readonly', 'private'] as const)(
  'expires %s rooms once across duplicate wakes and restarts',
  async (mode) => {
    const f = fixture(mode);
    vi.spyOn(Date, 'now').mockReturnValue(deadline);
    await f.object.alarm();
    expect(f.state().mode).toBe(mode === 'open' ? 'readonly' : mode);
    expect(f.audit().filter((entry) => entry.action === 'ended')).toHaveLength(
      1
    );
    expect(f.counters()).toEqual({ reads: 3, writes: 3 });
    const restarted = f.instance();
    for (let wake = 0; wake < 100; wake++) await restarted.alarm();
    expect(f.counters()).toEqual({ reads: 303, writes: 3 });
    expect(f.state().revision).toBe(1);
    expect(f.audit()).toHaveLength(1);
    expect(f.setAlarm).not.toHaveBeenCalled();
  }
);

it('atomically rolls back state, audit and completion when storage fails', async () => {
  const f = fixture();
  vi.spyOn(Date, 'now').mockReturnValue(deadline);
  f.failMarker(true);
  await expect(f.object.alarm()).rejects.toThrow('marker write unavailable');
  expect(f.state().mode).toBe('open');
  expect(f.state().revision).toBe(0);
  expect(f.audit()).toHaveLength(0);
  f.failMarker(false);
  await f.instance().alarm();
  await f.instance().alarm();
  expect(f.state().revision).toBe(1);
  expect(f.audit()).toHaveLength(1);
  expect(f.counters().writes).toBe(6);
  expect(f.setAlarm).not.toHaveBeenCalled();
});

it('allows an extended schedule to expire independently of its old marker', async () => {
  const f = fixture();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline);
  await f.object.alarm();
  f.seed({ ...f.state(), mode: 'open', endsAt: deadline + 60_000 });
  await f.instance().alarm();
  expect(f.setAlarm).toHaveBeenCalledExactlyOnceWith(deadline + 60_000);
  expect(f.counters().writes).toBe(3);
  clock.mockReturnValue(deadline + 60_000);
  await f.instance().alarm();
  await f.instance().alarm();
  expect(f.audit()).toHaveLength(2);
  expect(f.state().revision).toBe(2);
  expect(f.counters().writes).toBe(6);
});

it('does no writes for open-ended rooms or early alarms', async () => {
  const f = fixture();
  vi.spyOn(Date, 'now').mockReturnValue(deadline - 1);
  await f.object.alarm();
  expect(f.setAlarm).toHaveBeenCalledExactlyOnceWith(deadline);
  f.seed({ ...f.state(), endsAt: null });
  await f.instance().alarm();
  expect(f.counters().writes).toBe(0);
  expect(f.audit()).toHaveLength(0);
  expect(f.setAlarm).toHaveBeenCalledTimes(1);
});
