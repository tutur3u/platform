/**
 * The confirmation query over Hyperdrive. One short-lived postgres.js client
 * per call (one connection, no type fetch, no retry), closed when the query
 * settles or the caller aborts.
 *
 * The statement is uncacheable by construction: Hyperdrive never caches a
 * query that calls a volatile or stable built-in, and it detects the common
 * ones (`NOW()`, `RANDOM()`) by matching the query text, so the select list
 * carries `now()` and `clock_timestamp()` beside the confirmation. The
 * Hyperdrive configuration must also have caching disabled (defence in
 * depth): a cached answer would outlive a revocation or a signature.
 */
import postgres from 'postgres';
import type { ConfirmQuery } from './database-confirmation';

/** The slice of the Hyperdrive binding the query uses. */
export type HyperdriveLike = Readonly<{ connectionString: string }>;

export const CONNECT_TIMEOUT_SECONDS = 2;

/**
 * The one statement the Worker sends. `$1` is the transaction id, `$2` the
 * client id and `$3` the kid. `now()` and `clock_timestamp()` keep Hyperdrive
 * from caching the reply; only `fields` is read.
 */
export const CONFIRMATION_STATEMENT =
  'select public.sso_signer_confirm_transaction($1::uuid, $2::uuid, $3::text) as fields, ' +
  'now() as read_at, clock_timestamp() as checked_at';

export function hyperdriveQuery(
  hyperdrive: HyperdriveLike,
  waitUntil: (promise: Promise<unknown>) => void
): ConfirmQuery {
  return async (args, signal) => {
    const sql = postgres(hyperdrive.connectionString, {
      max: 1,
      fetch_types: false,
      prepare: true,
      connect_timeout: CONNECT_TIMEOUT_SECONDS,
      idle_timeout: 1,
      max_lifetime: 30,
      onnotice: () => {},
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      waitUntil(sql.end({ timeout: 0 }).catch(() => {}));
    };
    signal.addEventListener('abort', close, { once: true });
    try {
      const rows = await sql.unsafe<{ fields: unknown }[]>(
        CONFIRMATION_STATEMENT,
        [args.transactionId, args.clientId, args.kid],
        { prepare: true }
      );
      if (rows.length !== 1) throw new Error('unexpected row count');
      return rows[0]?.fields ?? null;
    } finally {
      signal.removeEventListener('abort', close);
      close();
    }
  };
}
