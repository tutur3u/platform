import { DurableObject } from 'cloudflare:workers';
import { seriesSchema } from './contract-v2';
import {
  initializeDecisions,
  readDecisions,
  storeDecisions,
  validateDecisions,
} from './decisions';
import { exportPage } from './export';
import { DAY, eraseContent, HOUR, maintainHub } from './maintenance';
import {
  initializeObservability,
  readObservability,
  storeObservability,
  validateObservability,
} from './observability';
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
    initializeDecisions(this.ctx.storage.sql);
    initializeObservability(this.ctx.storage.sql);
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
    if (!row) return null;
    const stored = snapshotSchema.parse(JSON.parse(row.data));
    return { ...stored, needsYou: this.items(now) };
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    let now = Date.now();
    let flags = this.flags();
    if (request.method === 'GET' && url.pathname === '/status') {
      return json({
        v: 2,
        enabled: Boolean(flags.enabled),
        erased: Boolean(flags.erased),
        seq: flags.seq,
        lastPublisherAt: flags.lastPublisherAt || null,
        publisherStale:
          Boolean(flags.enabled) &&
          (!flags.lastPublisherAt || now - flags.lastPublisherAt > 15 * 60_000),
      });
    }
    if (!flags.enabled) return json({ error: 'Hub paused' }, 503);
    if (request.method === 'POST' && url.pathname === '/ingest') {
      const parsed = ingestSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: 'Invalid payload' }, 400);
      flags = this.flags();
      if (!flags.enabled) return json({ error: 'Hub paused' }, 503);
      const body = parsed.data;
      if (Math.abs(now - body.sentAt) > 120_000)
        return json({ error: 'Clock skew' }, 400);
      if (body.seq <= flags.seq) return json({ error: 'Sequence replay' }, 409);
      const scheduled = await this.ctx.storage.getAlarm();
      if (scheduled === null) await this.ctx.storage.setAlarm(now + HOUR);
      flags = this.flags();
      now = Date.now();
      if (!flags.enabled) {
        if (flags.erased) await this.ctx.storage.deleteAlarm();
        return json({ error: 'Hub paused' }, 503);
      }
      if (body.seq <= flags.seq) return json({ error: 'Sequence replay' }, 409);
      if (Math.abs(now - body.sentAt) > 120_000)
        return json({ error: 'Clock skew' }, 400);
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
      if (
        !validateDecisions(this.ctx.storage.sql, body.decisions, now) ||
        (body.observability &&
          !validateObservability(this.ctx.storage.sql, body.observability, now))
      ) {
        return json({ error: 'Invalid decision or observability batch' }, 400);
      }
      const existingItems = this.ctx.storage.sql
        .exec<{ id: string; version: number; data: string }>(
          'SELECT id, version, data FROM needs_you WHERE completedAt IS NULL OR completedAt > ?',
          now - 30 * DAY
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
        storeDecisions(this.ctx.storage.sql, body.decisions);
        if (body.observability)
          storeObservability(this.ctx.storage.sql, body.observability, now);
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
        if (body.events.length > 0)
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
      return json({ seq: body.seq, v: body.v });
    }
    if (request.method === 'DELETE' && url.pathname === '/hub') {
      // Preserve only a disabled replay tombstone: old signed requests cannot recreate erased data.
      this.ctx.storage.transactionSync(() => {
        eraseContent(this.ctx.storage.sql);
        this.ctx.storage.sql.exec(
          'UPDATE flags SET enabled=0,lastPublisherAt=0,stale=0,erased=1 WHERE id=1'
        );
      });
      await this.ctx.storage.deleteAlarm();
      return json({ erased: true });
    }
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404);
    const expired = now - flags.lastPublisherAt >= 30 * DAY;
    const snapshot =
      !expired && ['/snapshot', '/environments'].includes(url.pathname)
        ? this.snapshot(now)
        : null;
    if (url.pathname === '/snapshot') return json(snapshot);
    if (url.pathname === '/environments')
      return json(snapshot?.environments ?? []);
    if (url.pathname === '/needs-you')
      return json(expired ? [] : this.items(now));
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
    if (url.pathname === '/decisions')
      return json(
        readDecisions(
          this.ctx.storage.sql,
          url.searchParams.get('after') ?? '0',
          url.searchParams.get('category'),
          now
        )
      );
    if (url.pathname === '/observability')
      return json(
        readObservability(
          this.ctx.storage.sql,
          Number(url.searchParams.get('since') ?? 0),
          seriesSchema.parse(url.searchParams.get('series') ?? 'quota_series'),
          now
        )
      );
    if (url.pathname === '/hub/export') {
      const version = url.searchParams.get('seq');
      if (version !== null && Number(version) !== flags.seq)
        return json({ error: 'Export changed; restart' }, 409);
      return json({
        v: 2,
        seq: flags.seq,
        ...exportPage(
          this.ctx.storage.sql,
          url.searchParams.get('section') ?? 'snapshot',
          Number(url.searchParams.get('after') ?? 0),
          now,
          expired
        ),
      });
    }
    return json({ error: 'Not found' }, 404);
  }
  async alarm() {
    const flags = this.flags();
    if (flags.erased || !flags.lastPublisherAt) {
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
