import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import {
  CATCHUP_DELAY,
  DAY,
  eraseContent,
  HOUR,
  maintainHub,
} from './maintenance';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE events(ts INTEGER); CREATE TABLE needs_you(completedAt INTEGER);
    CREATE TABLE decisions(at INTEGER); CREATE TABLE metrics(series TEXT,t INTEGER);
    CREATE TABLE metric_dimensions(series TEXT,lastAt INTEGER); CREATE TABLE snapshot(data TEXT); CREATE TABLE observability_snapshot(at INTEGER,data TEXT);
    CREATE TABLE flags(id INTEGER,stale INTEGER); INSERT INTO flags VALUES(1,0)`);
  let operations = 0;
  const sql = {
    exec(query: string, ...params: (number | string)[]) {
      operations++;
      const statement = db.prepare(query);
      if (query.startsWith('SELECT'))
        return { rowsWritten: 0, toArray: () => statement.all(...params) };
      const result = statement.run(...params);
      return { rowsWritten: Number(result.changes), toArray: () => [] };
    },
  };
  return { db, sql, operations: () => operations };
}
it('purges SQLite retention boundaries, preserves open items and has bounded normal work', () => {
  const { db, sql, operations } = database();
  const now = 100 * DAY;
  for (const ts of [now - 31 * DAY, now - 30 * DAY, now - DAY])
    db.prepare('INSERT INTO events VALUES(?)').run(ts);
  for (const ts of [null, now - 31 * DAY, now - DAY])
    db.prepare('INSERT INTO needs_you VALUES(?)').run(ts);
  db.prepare('INSERT INTO decisions VALUES(?)').run(now - 31 * DAY);
  db.prepare('INSERT INTO metrics VALUES(?,?)').run(
    'quota_series',
    now - 7 * DAY
  );
  db.prepare('INSERT INTO metrics VALUES(?,?)').run(
    'speed_series',
    now - 8 * DAY
  );
  db.exec("INSERT INTO observability_snapshot VALUES(0,'expired')");
  expect(maintainHub(sql, true, now - HOUR, now)).toBe(now + HOUR);
  expect(operations()).toBe(14);
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM observability_snapshot').get()
  ).toEqual({ count: 0 });
  expect(db.prepare('SELECT * FROM events').all()).toEqual([{ ts: now - DAY }]);
  expect(db.prepare('SELECT * FROM needs_you').all()).toEqual([
    { completedAt: null },
    { completedAt: now - DAY },
  ]);
  expect(db.prepare('SELECT COUNT(*) AS count FROM decisions').get()).toEqual({
    count: 0,
  });
  expect(db.prepare('SELECT * FROM metrics').all()).toEqual([
    { series: 'speed_series', t: now - 8 * DAY },
  ]);
  expect(db.prepare('SELECT stale FROM flags').get()).toEqual({ stale: 1 });
  maintainHub(sql, true, now - HOUR, now);
  expect(db.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({
    count: 1,
  });
  const before = operations();
  expect(maintainHub(sql, false, now, now)).toBeNull();
  expect(operations()).toBe(before);
  expect(maintainHub(sql, true, now - 31 * DAY, now)).toBeNull();
  expect(db.prepare('SELECT COUNT(*) AS count FROM needs_you').get()).toEqual({
    count: 0,
  });
  db.close();
});
it('uses bounded deletion batches, persists catch-up progress and survives a retry', () => {
  const { db, sql, operations } = database();
  const now = 100 * DAY;
  db.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000)
    INSERT INTO metrics SELECT 'quota_series',0 FROM n`);
  expect(maintainHub(sql, true, now, now)).toBe(now + CATCHUP_DELAY);
  expect(operations()).toBe(21);
  expect(db.prepare('SELECT COUNT(*) AS count FROM metrics').get()).toEqual({
    count: 904,
  });
  expect(maintainHub(sql, true, now, now + CATCHUP_DELAY)).toBe(
    now + CATCHUP_DELAY + HOUR
  );
  expect(db.prepare('SELECT COUNT(*) AS count FROM metrics').get()).toEqual({
    count: 0,
  });
  expect(maintainHub(sql, true, now, now + CATCHUP_DELAY)).toBe(
    now + CATCHUP_DELAY + HOUR
  );
  db.close();
});
it('purges the full quota storage ceiling before a durable terminal stop', () => {
  const { db, sql, operations } = database();
  db.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<80672)
    INSERT INTO metrics SELECT 'quota_series',0 FROM n`);
  db.exec(
    "INSERT INTO snapshot VALUES('private'); INSERT INTO needs_you VALUES(NULL); INSERT INTO observability_snapshot VALUES(0,'private')"
  );
  eraseContent(sql);
  expect(operations()).toBeLessThanOrEqual(165);
  for (const table of [
    'snapshot',
    'events',
    'needs_you',
    'decisions',
    'metrics',
    'metric_dimensions',
    'observability_snapshot',
  ]) {
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
      count: 0,
    });
  }
  const before = operations();
  expect(maintainHub(sql, false, 0, Date.now())).toBeNull();
  expect(operations()).toBe(before);
  db.close();
});
