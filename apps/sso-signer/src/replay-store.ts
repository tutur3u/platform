/**
 * `SignerReplay` over SQLite: single-use request nonces, permit IDs and
 * transaction IDs, strongly consistent, so a replay to another isolate or
 * region is refused. Never KV or isolate memory.
 *
 * A sign request claims its nonce, its permit and its transaction in one
 * SQLite transaction, all or none. The transaction claim makes signing
 * single-use per transaction even for a caller that can mint fresh permits
 * and nonces; it is held for `TRANSACTION_CLAIM_TTL_MS`, longer than a
 * transaction lives plus the clock skew, and it is in addition to the
 * database confirmation, not instead of it.
 *
 * Bounds: each claim first deletes at most `SWEEP_LIMIT` expired rows, then
 * inserts at most three. Live rows are counted in a meta row (no table
 * scans) and capped at `MAX_LIVE_TOKENS`; at the cap the store refuses new
 * claims, failing closed, until sweeps free space. There is no alarm.
 */
import { firstRow, type SqlRunner, type Transaction } from './sql';

export const SWEEP_LIMIT = 32;
export const MAX_LIVE_TOKENS = 50_000;
/** A transaction lives 5 minutes; the claim outlives it and the skew. */
export const TRANSACTION_CLAIM_TTL_MS = 10 * 60_000;
/**
 * Longest a token may be held: the transaction claim plus a minute, so the
 * caller's clock may lead this object's clock without refusing the claim.
 */
export const MAX_TOKEN_TTL_MS = TRANSACTION_CLAIM_TTL_MS + 60_000;
export const MAX_CLAIM_TOKENS = 3;

export type TokenKind = 'nonce' | 'permit' | 'transaction';
export type ClaimToken = Readonly<{
  kind: TokenKind;
  token: string;
  expiresAtMs: number;
}>;
export type ClaimResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: 'replayed' | 'replay_capacity' }>;

const TOKEN_TEXT: Readonly<Record<TokenKind, RegExp>> = Object.freeze({
  nonce: /^[A-Za-z0-9_-]{22,43}$/u,
  permit: /^[A-Za-z0-9_-]{22,43}$/u,
  // Lowercase only, so one transaction has exactly one token.
  transaction:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
});

function validToken(token: ClaimToken, nowMs: number): boolean {
  return (
    Object.hasOwn(TOKEN_TEXT, token.kind) &&
    TOKEN_TEXT[token.kind].test(token.token) &&
    Number.isSafeInteger(token.expiresAtMs) &&
    token.expiresAtMs > nowMs &&
    token.expiresAtMs <= nowMs + MAX_TOKEN_TTL_MS
  );
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS used_token (
    kind TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (kind, token)
  )`,
  'CREATE INDEX IF NOT EXISTS used_token_expiry ON used_token (expires_at)',
  `CREATE TABLE IF NOT EXISTS replay_meta (
    k TEXT PRIMARY KEY,
    v INTEGER NOT NULL
  )`,
];

export function createReplayStore(sql: SqlRunner, transaction: Transaction) {
  for (const statement of SCHEMA) sql.exec(statement);

  const live = () =>
    Number(firstRow(sql, "SELECT v FROM replay_meta WHERE k = 'live'")?.v ?? 0);
  const setLive = (value: number) =>
    sql.exec(
      "INSERT INTO replay_meta (k, v) VALUES ('live', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
      Math.max(0, value)
    );

  return Object.freeze({
    /** Claims every token or none. */
    claim(tokens: readonly ClaimToken[], nowMs: number): ClaimResult {
      if (
        tokens.length === 0 ||
        tokens.length > MAX_CLAIM_TOKENS ||
        new Set(tokens.map((token) => token.kind)).size !== tokens.length ||
        !tokens.every((token) => validToken(token, nowMs))
      ) {
        throw new TypeError('invalid claim');
      }
      return transaction(() => {
        const swept = sql
          .exec(
            `DELETE FROM used_token WHERE rowid IN (
              SELECT rowid FROM used_token WHERE expires_at <= ?
              ORDER BY expires_at LIMIT ?
            ) RETURNING 1`,
            nowMs,
            SWEEP_LIMIT
          )
          .toArray().length;
        let count = live() - swept;
        for (const token of tokens) {
          if (
            firstRow(
              sql,
              'SELECT 1 AS hit FROM used_token WHERE kind = ? AND token = ?',
              token.kind,
              token.token
            )
          ) {
            setLive(count);
            return { ok: false, error: 'replayed' } as const;
          }
        }
        if (count + tokens.length > MAX_LIVE_TOKENS) {
          setLive(count);
          return { ok: false, error: 'replay_capacity' } as const;
        }
        for (const token of tokens) {
          sql.exec(
            'INSERT INTO used_token (kind, token, expires_at) VALUES (?, ?, ?)',
            token.kind,
            token.token,
            token.expiresAtMs
          );
          count += 1;
        }
        setLive(count);
        return { ok: true } as const;
      });
    },

    liveCount: live,
  });
}
