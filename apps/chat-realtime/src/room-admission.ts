import {
  CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS,
  CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS,
  type ChatRealtimeSubscribeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import { LIMITS } from './protocol';

const REVOCATION_LIMIT = 5_000;
const REVOCATION_TTL_SECONDS =
  CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS +
  2 * CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS;

export class RoomAdmission {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS chat_connect_windows (
        user_id TEXT PRIMARY KEY, ends_at INTEGER NOT NULL, attempts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_connect_expiry ON chat_connect_windows(ends_at);
      CREATE TABLE IF NOT EXISTS chat_revocations (
        user_id TEXT PRIMARY KEY, removed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_revocation_expiry ON chat_revocations(removed_at);
      CREATE TABLE IF NOT EXISTS chat_revocation_overflow (
        slot INTEGER PRIMARY KEY CHECK (slot = 1), removed_at INTEGER NOT NULL
      );
    `);
  }

  mayConnect(ticket: ChatRealtimeSubscribeTicket, now: number) {
    const row = this.storage.sql
      .exec<{ removed_at: number | null }>(
        `SELECT MAX(removed_at) AS removed_at FROM (
          SELECT removed_at FROM chat_revocations WHERE user_id = ?
          UNION ALL SELECT removed_at FROM chat_revocation_overflow
        )`,
        ticket.userId
      )
      .one();
    const cutoff = row.removed_at;
    return (
      cutoff === null ||
      cutoff <= Math.floor(now / 1_000) - REVOCATION_TTL_SECONDS ||
      ticket.iat > cutoff + CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS
    );
  }

  revoke(userId: string, now: number) {
    const removedAt = Math.floor(now / 1_000);
    const sql = this.storage.sql;
    sql.exec(
      'DELETE FROM chat_revocations WHERE removed_at <= ?',
      removedAt - REVOCATION_TTL_SECONDS
    );
    sql.exec(
      `INSERT INTO chat_revocations (user_id, removed_at)
        SELECT ?, ? WHERE EXISTS (SELECT 1 FROM chat_revocations WHERE user_id = ?)
          OR (SELECT COUNT(*) FROM chat_revocations) < ?
        ON CONFLICT(user_id) DO UPDATE SET removed_at = MAX(removed_at, excluded.removed_at)`,
      userId,
      removedAt,
      userId,
      REVOCATION_LIMIT
    );
    if (
      !sql
        .exec('SELECT 1 FROM chat_revocations WHERE user_id = ?', userId)
        .toArray().length
    ) {
      // Preserve the revocation fence if the per-user table is at capacity.
      sql.exec(
        `INSERT INTO chat_revocation_overflow (slot, removed_at) VALUES (1, ?)
          ON CONFLICT(slot) DO UPDATE SET removed_at = MAX(removed_at, excluded.removed_at)`,
        removedAt
      );
    }
  }

  consumeConnect(userId: string, now: number, maxUsers: number) {
    return this.storage.transactionSync(() => {
      const sql = this.storage.sql;
      sql.exec('DELETE FROM chat_connect_windows WHERE ends_at <= ?', now);
      return (
        sql
          .exec(
            `INSERT INTO chat_connect_windows (user_id, ends_at, attempts)
              SELECT ?, ?, 1 WHERE EXISTS (SELECT 1 FROM chat_connect_windows WHERE user_id = ?)
                OR (SELECT COUNT(*) FROM chat_connect_windows) < ?
              ON CONFLICT(user_id) DO UPDATE SET attempts = attempts + 1
                WHERE attempts < ?
              RETURNING attempts`,
            userId,
            now + LIMITS.connectWindowMs,
            userId,
            maxUsers,
            LIMITS.connectsPerWindow
          )
          .toArray().length > 0
      );
    });
  }
}
