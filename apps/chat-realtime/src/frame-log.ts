import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import { LIMITS } from './protocol';

type Row = { at: number; body: string; seq: number };

export type ReplayResult =
  | { kind: 'current' }
  | { kind: 'replay'; frames: { event: ChatRealtimeEvent; seq: number }[] }
  | { kind: 'resync' };

/**
 * Bounded per-conversation frame log in Durable Object SQLite. Each append
 * writes one row, updates the sequence and prunes to `LIMITS.logFrames` rows
 * no older than `LIMITS.logMaxAgeMs`, so storage stays bounded.
 */
export class FrameLog {
  constructor(private sql: SqlStorage) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS frames (
        seq INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        body TEXT NOT NULL
      );
    `);
  }

  current() {
    const row = this.sql
      .exec<{ v: number }>("SELECT v FROM meta WHERE k = 'seq'")
      .toArray()[0];
    return row?.v ?? 0;
  }

  append(event: ChatRealtimeEvent, now = Date.now()) {
    const seq = this.current() + 1;
    this.sql.exec(
      "INSERT INTO meta (k, v) VALUES ('seq', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      seq
    );
    this.sql.exec(
      'INSERT INTO frames (seq, at, body) VALUES (?, ?, ?)',
      seq,
      now,
      JSON.stringify(event)
    );
    this.sql.exec(
      'DELETE FROM frames WHERE seq <= ? OR at < ?',
      seq - LIMITS.logFrames,
      now - LIMITS.logMaxAgeMs
    );
    return seq;
  }

  /** Frames after `since`, or `resync` when the log no longer covers the gap. */
  since(since: number, now = Date.now()): ReplayResult {
    const current = this.current();
    if (since === current) return { kind: 'current' };
    if (since > current) return { kind: 'resync' };
    const rows = this.sql
      .exec<Row>(
        'SELECT seq, at, body FROM frames WHERE seq > ? AND at >= ? ORDER BY seq',
        since,
        now - LIMITS.logMaxAgeMs
      )
      .toArray();
    if (rows[0]?.seq !== since + 1 || rows.length !== current - since) {
      return { kind: 'resync' };
    }
    return {
      frames: rows.map((row) => ({
        event: JSON.parse(row.body) as ChatRealtimeEvent,
        seq: row.seq,
      })),
      kind: 'replay',
    };
  }
}
