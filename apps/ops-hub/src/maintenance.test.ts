import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { DAY, HOUR, maintainHub } from './maintenance';

it('purges real SQLite rows at the retention boundary, is idempotent and bounded', () => {
  const db = new DatabaseSync(':memory:');
  const now = 100 * DAY;
  db.exec(
    'CREATE TABLE events(ts INTEGER); CREATE TABLE needs_you(completedAt INTEGER); CREATE TABLE flags(id INTEGER,stale INTEGER); INSERT INTO flags VALUES(1,0)'
  );
  for (const ts of [now - 31 * DAY, now - 30 * DAY, now - DAY])
    db.prepare('INSERT INTO events VALUES(?)').run(ts);
  for (const ts of [null, now - 31 * DAY, now - DAY])
    db.prepare('INSERT INTO needs_you VALUES(?)').run(ts);
  let operations = 0;
  const sql = {
    exec(query: string, ...params: number[]) {
      operations++;
      db.prepare(query).run(...params);
    },
  };
  expect(maintainHub(sql, true, now - HOUR, now)).toBe(now + HOUR);
  expect(operations).toBe(3);
  expect(db.prepare('SELECT * FROM events').all()).toEqual([{ ts: now - DAY }]);
  expect(db.prepare('SELECT * FROM needs_you').all()).toEqual([
    { completedAt: null },
    { completedAt: now - DAY },
  ]);
  expect(db.prepare('SELECT stale FROM flags').get()).toEqual({ stale: 1 });
  maintainHub(sql, true, now - HOUR, now);
  expect(db.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({
    count: 1,
  });
  expect(maintainHub(sql, true, now - 31 * DAY, now)).toBeNull();
  const before = operations;
  expect(maintainHub(sql, false, now, now)).toBeNull();
  expect(operations).toBe(before);
  db.close();
});
