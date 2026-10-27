import { DurableObject } from 'cloudflare:workers';
import { DAY, HOUR, maintainHub } from './maintenance';
import { json } from './protocol';
import { type HubSnapshot, ingestSchema, snapshotSchema } from './schema';

type Flags = {
  enabled: number;
  seq: number;
  lastPublisherAt: number;
  lastEventSeq: number;
  windowStart: number;
  ingests: number;
  stale: number;
  erased: number;
};
type Stored = { data: string };
export class OpsHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS flags (
        id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 1,
        seq INTEGER NOT NULL DEFAULT 0, lastPublisherAt INTEGER NOT NULL DEFAULT 0,
        lastEventSeq INTEGER NOT NULL DEFAULT 0, windowStart INTEGER NOT NULL DEFAULT 0,
        ingests INTEGER NOT NULL DEFAULT 0, stale INTEGER NOT NULL DEFAULT 0,
        erased INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO flags(id) VALUES(1);
      CREATE TABLE IF NOT EXISTS snapshot(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, ts INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
      CREATE TABLE IF NOT EXISTS needs_you(id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, completedAt INTEGER);
    `);
  }
  private flags() {
    return this.ctx.storage.sql
      .exec<Flags>('SELECT * FROM flags WHERE id=1')
      .one();
  }
  private items(now: number) {
    return this.ctx.storage.sql
      .exec<Stored>(
        'SELECT data FROM needs_you WHERE completedAt IS NULL OR completedAt > ? ORDER BY id LIMIT 100',
        now - 30 * DAY
      )
      .toArray()
      .map((row) => JSON.parse(row.data));
  }
  private snapshot(now: number): HubSnapshot | null {
    const row = this.ctx.storage.sql
      .exec<Stored>('SELECT data FROM snapshot WHERE id=1')
      .toArray()[0];
    return row
      ? snapshotSchema.parse({
          ...JSON.parse(row.data),
          needsYou: this.items(now),
        })
      : null;
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    const now = Date.now();
    const flags = this.flags();
    if (request.method === 'GET' && url.pathname === '/status') {
      return json({
        enabled: Boolean(flags.enabled),
        seq: flags.seq,
        lastPublisherAt: flags.lastPublisherAt || null,
        publisherStale:
          !flags.lastPublisherAt || now - flags.lastPublisherAt > 15 * 60_000,
      });
    }
    if (!flags.enabled) return json({ error: 'Hub paused' }, 503);
    if (request.method === 'POST' && url.pathname === '/ingest') {
      const parsed = ingestSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: 'Invalid payload' }, 400);
      const body = parsed.data;
      if (Math.abs(now - body.sentAt) > 120_000)
        return json({ error: 'Clock skew' }, 400);
      if (body.seq <= flags.seq) return json({ error: 'Sequence replay' }, 409);
      let eventSeq = flags.lastEventSeq;
      for (const event of body.events) {
        if (
          event.seq <= eventSeq ||
          event.ts < now - 30 * DAY ||
          event.ts > now + 120_000
        ) {
          return json({ error: 'Invalid event sequence or time' }, 400);
        }
        eventSeq = event.seq;
      }
      const windowStart =
        now - flags.windowStart >= HOUR ? now : flags.windowStart;
      const ingests = windowStart === flags.windowStart ? flags.ingests + 1 : 1;
      if (ingests > 120) return json({ error: 'Ingest budget reached' }, 429);
      const existingItems = this.ctx.storage.sql
        .exec<{ id: string; version: number; data: string }>(
          'SELECT id, version, data FROM needs_you'
        )
        .toArray();
      const incoming = body.snapshot?.needsYou ?? [];
      const ids = new Set(existingItems.map((item) => item.id));
      for (const item of incoming) {
        ids.add(item.id);
        const previous = existingItems.find((old) => old.id === item.id);
        if (
          previous &&
          (item.version < previous.version ||
            (item.version === previous.version &&
              JSON.stringify(item) !== previous.data))
        ) {
          return json({ error: 'Item version conflict' }, 409);
        }
      }
      if (ids.size > 100) return json({ error: 'Item budget reached' }, 409);
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          'DELETE FROM events WHERE ts <= ?',
          now - 30 * DAY
        );
        this.ctx.storage.sql.exec(
          'DELETE FROM needs_you WHERE completedAt <= ?',
          now - 30 * DAY
        );
        for (const event of body.events) {
          this.ctx.storage.sql.exec(
            'INSERT INTO events(seq,ts,data) VALUES(?,?,?)',
            event.seq,
            event.ts,
            JSON.stringify(event)
          );
        }
        this.ctx.storage.sql.exec(
          'DELETE FROM events WHERE seq NOT IN (SELECT seq FROM events ORDER BY seq DESC LIMIT 1000)'
        );
        if (body.snapshot) {
          this.ctx.storage.sql.exec(
            'INSERT OR REPLACE INTO snapshot(id,data) VALUES(1,?)',
            JSON.stringify({ ...body.snapshot, needsYou: [] })
          );
          for (const item of incoming) {
            this.ctx.storage.sql.exec(
              `INSERT INTO needs_you(id,version,data,completedAt) VALUES(?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,
              completedAt=CASE WHEN excluded.completedAt IS NULL THEN NULL ELSE COALESCE(needs_you.completedAt,excluded.completedAt) END`,
              item.id,
              item.version,
              JSON.stringify(item),
              item.status === 'open' ? null : now
            );
          }
        }
        this.ctx.storage.sql.exec(
          `UPDATE flags SET enabled=?,seq=?,lastPublisherAt=?,lastEventSeq=?,
          windowStart=?,ingests=?,stale=0 WHERE id=1`,
          body.snapshot?.enabled === false ? 0 : 1,
          body.seq,
          now,
          eventSeq,
          windowStart,
          ingests
        );
      });
      if (body.snapshot?.enabled === false)
        await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(now + HOUR);
      return json({ seq: body.seq });
    }
    if (request.method === 'DELETE' && url.pathname === '/hub') {
      // Preserve only a disabled replay tombstone: old signed requests cannot recreate erased data.
      this.ctx.storage.transactionSync(() => {
        for (const table of ['snapshot', 'events', 'needs_you'])
          this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
        this.ctx.storage.sql.exec(
          'UPDATE flags SET enabled=0,lastPublisherAt=0,stale=0,erased=1 WHERE id=1'
        );
      });
      await this.ctx.storage.deleteAlarm();
      return json({ erased: true });
    }
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404);
    const snapshot = this.snapshot(now);
    if (url.pathname === '/snapshot') return json(snapshot);
    if (url.pathname === '/environments')
      return json(snapshot?.environments ?? []);
    if (url.pathname === '/needs-you') return json(this.items(now));
    const rows = () =>
      this.ctx.storage.sql
        .exec<Stored>(
          'SELECT data FROM events WHERE seq > ? AND ts > ? ORDER BY seq LIMIT 200',
          Number(url.searchParams.get('after') ?? 0),
          now - 30 * DAY
        )
        .toArray()
        .map((row) => JSON.parse(row.data));
    if (url.pathname === '/events')
      return json({ events: rows(), lastSeq: flags.lastEventSeq });
    if (url.pathname === '/hub/export') {
      const events = this.ctx.storage.sql
        .exec<Stored>(
          'SELECT data FROM events WHERE ts > ? ORDER BY seq LIMIT 1000',
          now - 30 * DAY
        )
        .toArray()
        .map((row) => JSON.parse(row.data));
      return json({ v: 1, snapshot, events, needsYou: this.items(now), flags });
    }
    return json({ error: 'Not found' }, 404);
  }
  async alarm() {
    const flags = this.flags();
    if (!flags.enabled) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = this.ctx.storage.transactionSync(() =>
      maintainHub(
        this.ctx.storage.sql,
        Boolean(flags.enabled),
        flags.lastPublisherAt,
        Date.now()
      )
    );
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}
