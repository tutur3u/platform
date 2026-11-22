/**
 * Storage engine of the fleet bridge: reply records (the receipt and the
 * audit trail in one row), the outbox of undelivered frames, single-use
 * connect tickets, the newest poke per topic and machine presence. Runs
 * inside one Durable Object, so every call is atomic.
 *
 * Billing bounds: no alarms or self-scheduling; expiry and retention run a
 * few rows at a time during writes; the outbox, live tickets, replies per
 * thread and per hour and billable operations per UTC day are all capped
 * durably; a stop fence refuses every new operation.
 */
import {
  BRIDGE_LIMITS,
  OWNER_LIVE_LEASE_MS,
  type BridgeDelivery,
  type BridgeErrorCode,
  type BridgeMachineStatus,
  type BridgePoke,
  type BridgePokeTopic,
  type BridgeReceipt,
  type BridgeReceiptState,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { type SqlLike, utcDay } from './engine';

export class BridgeError extends Error {
  constructor(readonly code: BridgeErrorCode) {
    super(code);
  }
}

export interface BridgeReplyInput {
  id: string;
  machineId: string;
  threadId: string;
  environmentId?: string;
  actorId: string;
  /** Keyed digest of the text; the store never sees the text itself. */
  textDigest: string;
  /** Raw Ed25519 public key (base64url) acknowledgements must verify under. */
  ackKey: string;
  expiresAt: number;
  /** The exact frame pushed to the machine; dropped once the reply settles. */
  frame: string;
}

type Row = Record<string, unknown>;

function toReceipt(row: Row): BridgeReceipt {
  return {
    id: String(row.id),
    machineId: String(row.machine),
    threadId: String(row.thread),
    ...(row.env ? { environmentId: String(row.env) } : {}),
    state: row.state as BridgeReceiptState,
    ...(row.delivery ? { delivery: row.delivery as BridgeDelivery } : {}),
    ...(row.code ? { code: row.code as BridgeReceipt['code'] } : {}),
    createdAt: Number(row.at),
    ...(row.done_at === null || row.done_at === undefined
      ? {}
      : { settledAt: Number(row.done_at) }),
    textDigest: String(row.sha),
    ...(row.ack_sig ? { ackSig: String(row.ack_sig) } : {}),
  };
}

export function createBridgeEngine(sql: SqlLike) {
  const rows = (query: string, ...b: (string | number | null)[]) =>
    sql.exec(query, ...b).toArray();
  const count = (query: string, ...b: (string | number | null)[]) =>
    Number(rows(query, ...b)[0]?.n ?? 0);
  const meta = (key: string) =>
    (rows('SELECT v FROM meta WHERE k = ?', key)[0]?.v as string | undefined) ??
    null;
  const setMeta = (key: string, value: string) =>
    rows(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      value
    );

  function ensureSchema() {
    rows(
      'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
    );
    // One row per reply: receipt and audit record (who, when, where, hash).
    rows(
      `CREATE TABLE IF NOT EXISTS replies (
         id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL,
         machine TEXT NOT NULL, thread TEXT NOT NULL, env TEXT,
         sha TEXT NOT NULL, state TEXT NOT NULL, delivery TEXT, code TEXT,
         done_at INTEGER, ack_sig TEXT, ack_key TEXT NOT NULL,
         exp INTEGER NOT NULL)`
    );
    rows('CREATE INDEX IF NOT EXISTS replies_at ON replies (at)');
    rows('CREATE INDEX IF NOT EXISTS replies_thread ON replies (thread, at)');
    rows(
      'CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, frame TEXT NOT NULL)'
    );
    rows(
      'CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, role TEXT NOT NULL, machine TEXT, exp INTEGER NOT NULL, owner TEXT, lease_exp INTEGER)'
    );
    // Legacy machine tickets remain redeemable. Owner tickets without
    // identity or a lease cannot authorize notices.
    const ticketColumns = new Set(
      rows('PRAGMA table_info(tickets)').map((column) => column.name)
    );
    if (!ticketColumns.has('owner'))
      rows('ALTER TABLE tickets ADD COLUMN owner TEXT');
    if (!ticketColumns.has('lease_exp'))
      rows('ALTER TABLE tickets ADD COLUMN lease_exp INTEGER');
    rows(
      `CREATE TABLE IF NOT EXISTS pokes (
         machine TEXT NOT NULL, topic TEXT NOT NULL, revision INTEGER NOT NULL,
         observed TEXT NOT NULL, PRIMARY KEY (machine, topic))`
    );
    rows(
      'CREATE TABLE IF NOT EXISTS machines (machine TEXT PRIMARY KEY, connected_at INTEGER, disconnected_at INTEGER)'
    );
  }

  const stopped = () => meta('stopped') === '1';
  const refuseWhenStopped = () => {
    if (stopped()) throw new BridgeError('stopped');
  };

  /** Charges the daily operation budget; throws `budget` past it. */
  function charge(now: number, budget: number) {
    const day = utcDay(now);
    const used = meta('day') === day ? Number(meta('ops') ?? 0) : 0;
    if (used + 1 > budget) throw new BridgeError('budget');
    setMeta('day', day);
    setMeta('ops', String(used + 1));
  }

  /** Expires overdue replies and trims old records, a few rows per write. */
  function sweep(now: number) {
    const limit = BRIDGE_LIMITS.cleanupPerWrite;
    const overdue = rows(
      "SELECT id FROM replies WHERE state = 'sent' AND exp <= ? LIMIT ?",
      now,
      limit
    );
    for (const row of overdue) {
      rows(
        "UPDATE replies SET state = 'expired', done_at = ? WHERE id = ?",
        now,
        String(row.id)
      );
      rows('DELETE FROM outbox WHERE id = ?', String(row.id));
    }
    rows(
      'DELETE FROM replies WHERE id IN (SELECT id FROM replies WHERE at <= ? AND state != ? LIMIT ?)',
      now - BRIDGE_LIMITS.auditRetentionMs,
      'sent',
      limit
    );
    rows(
      'DELETE FROM tickets WHERE hash IN (SELECT hash FROM tickets WHERE exp <= ? LIMIT ?)',
      now,
      limit
    );
  }

  const reply = (id: string) =>
    rows('SELECT * FROM replies WHERE id = ?', id)[0];

  return {
    ensureSchema,
    stopped,
    setStopped(value: boolean) {
      setMeta('stopped', value ? '1' : '0');
    },
    status(now: number, budget: number) {
      const day = utcDay(now);
      return {
        stopped: stopped(),
        day,
        ops: meta('day') === day ? Number(meta('ops') ?? 0) : 0,
        budget,
        pending: count('SELECT count(*) AS n FROM outbox'),
        replies: count('SELECT count(*) AS n FROM replies'),
      };
    },

    /** Stores a single-use ticket by its hash. */
    mintTicket(
      input: { hash: string } & (
        | { role: 'machine'; machineId: string }
        | { role: 'owner'; ownerId: string; leaseExpiresAt: number }
      ),
      now: number,
      budget: number
    ) {
      refuseWhenStopped();
      if (
        input.role === 'owner' &&
        (input.leaseExpiresAt <= now ||
          input.leaseExpiresAt > now + OWNER_LIVE_LEASE_MS)
      )
        throw new BridgeError('unauthorized');
      sweep(now);
      if (
        count('SELECT count(*) AS n FROM tickets WHERE exp > ?', now) >=
        BRIDGE_LIMITS.maxLiveTickets
      )
        throw new BridgeError('rate_limited');
      charge(now, budget);
      const expiresAt = Math.min(
        now + BRIDGE_LIMITS.ticketTtlMs,
        input.role === 'owner' ? input.leaseExpiresAt : Number.POSITIVE_INFINITY
      );
      rows(
        'INSERT INTO tickets (hash, role, machine, exp, owner, lease_exp) VALUES (?, ?, ?, ?, ?, ?)',
        input.hash,
        input.role,
        input.role === 'machine' ? input.machineId : null,
        expiresAt,
        input.role === 'owner' ? input.ownerId : null,
        input.role === 'owner' ? input.leaseExpiresAt : null
      );
      return expiresAt;
    },

    /** Consumes a ticket: it admits one socket, once, before it expires. */
    redeemTicket(hash: string, now: number) {
      if (stopped()) return null;
      const row = rows('SELECT * FROM tickets WHERE hash = ?', hash)[0];
      if (!row) return null;
      rows('DELETE FROM tickets WHERE hash = ?', hash);
      if (Number(row.exp) <= now) return null;
      return row.role === 'machine' && typeof row.machine === 'string'
        ? ({ role: 'machine', machineId: row.machine } as const)
        : row.role === 'owner' &&
            typeof row.owner === 'string' &&
            Number(row.lease_exp) > now
          ? ({
              role: 'owner',
              ownerId: row.owner,
              leaseExpiresAt: Number(row.lease_exp),
            } as const)
          : null;
    },

    /**
     * Records a reply and queues its frame. The same id with the same text
     * and target returns the first receipt; with anything else it conflicts.
     */
    enqueue(input: BridgeReplyInput, now: number, budget: number) {
      const existing = reply(input.id);
      if (existing) {
        if (
          existing.sha !== input.textDigest ||
          existing.thread !== input.threadId ||
          (existing.env ?? null) !== (input.environmentId ?? null) ||
          existing.machine !== input.machineId ||
          existing.actor !== input.actorId
        )
          throw new BridgeError('conflict');
        return { receipt: toReceipt(existing), replayed: true };
      }
      refuseWhenStopped();
      if (input.expiresAt <= now) throw new BridgeError('bad_request');
      sweep(now);
      if (
        count(
          'SELECT count(*) AS n FROM replies WHERE thread = ? AND at > ?',
          input.threadId,
          now - 60_000
        ) >= BRIDGE_LIMITS.perThreadPerMinute ||
        count(
          'SELECT count(*) AS n FROM replies WHERE at > ?',
          now - 3_600_000
        ) >= BRIDGE_LIMITS.perHour
      )
        throw new BridgeError('rate_limited');
      if (
        count('SELECT count(*) AS n FROM outbox') >= BRIDGE_LIMITS.outboxMaxRows
      )
        throw new BridgeError('full');
      charge(now, budget);
      rows(
        `INSERT INTO replies (id, at, actor, machine, thread, env, sha, state, ack_key, exp)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
        input.id,
        now,
        input.actorId,
        input.machineId,
        input.threadId,
        input.environmentId ?? null,
        input.textDigest,
        input.ackKey,
        Math.min(input.expiresAt, now + BRIDGE_LIMITS.outboxTtlMs)
      );
      rows(
        'INSERT INTO outbox (id, frame) VALUES (?, ?)',
        input.id,
        input.frame
      );
      return { receipt: toReceipt(reply(input.id)!), replayed: false };
    },

    /**
     * Charges one operation for a machine frame that does work (an outbox
     * replay). Refused when stopped or past the budget, like any new work.
     */
    chargeFrame(now: number, budget: number) {
      refuseWhenStopped();
      charge(now, budget);
    },

    /**
     * Counts an operation that must not be refused (an acknowledgement of a
     * delivery that already happened), so it still uses up the daily budget.
     */
    countFrame(now: number) {
      const day = utcDay(now);
      const used = meta('day') === day ? Number(meta('ops') ?? 0) : 0;
      setMeta('day', day);
      setMeta('ops', String(used + 1));
    },

    /** Undelivered frames for a machine, oldest first. */
    pending(machineId: string, now: number) {
      return rows(
        `SELECT o.frame FROM outbox o JOIN replies r ON r.id = o.id
          WHERE r.machine = ? AND r.state = 'sent' AND r.exp > ?
          ORDER BY r.at, r.id LIMIT ?`,
        machineId,
        now,
        BRIDGE_LIMITS.replayBatch
      ).map((row) => String(row.frame));
    },

    /**
     * Settles a reply from the machine it was addressed to. Only a `sent`
     * reply changes; anything else returns the receipt it already has.
     */
    ack(
      input: {
        id: string;
        machineId: string;
        state: 'delivered' | 'failed';
        delivery?: BridgeDelivery;
        code?: BridgeReceipt['code'];
        /** The machine's signature, already verified by the caller. */
        sig: string;
      },
      now: number
    ) {
      const row = reply(input.id);
      if (!row || row.machine !== input.machineId) return null;
      if (row.state !== 'sent')
        return { receipt: toReceipt(row), changed: false };
      rows(
        'UPDATE replies SET state = ?, delivery = ?, code = ?, done_at = ?, ack_sig = ? WHERE id = ?',
        input.state,
        input.state === 'delivered' ? (input.delivery ?? null) : null,
        input.state === 'failed' ? (input.code ?? null) : null,
        now,
        input.sig,
        input.id
      );
      rows('DELETE FROM outbox WHERE id = ?', input.id);
      return { receipt: toReceipt(reply(input.id)!), changed: true };
    },

    /**
     * What an acknowledgement of a pending reply must be signed over and
     * under; null when the reply is unknown, settled or not this machine's.
     */
    ackContext(id: string, machineId: string) {
      const row = reply(id);
      return row && row.machine === machineId && row.state === 'sent'
        ? { textDigest: String(row.sha), ackKey: String(row.ack_key) }
        : null;
    },

    /** The receipt, with an overdue `sent` reported as expired. */
    receipt(id: string, now: number): BridgeReceipt | null {
      const row = reply(id);
      if (!row) return null;
      const receipt = toReceipt(row);
      return receipt.state === 'sent' && Number(row.exp) <= now
        ? { ...receipt, state: 'expired' }
        : receipt;
    },

    /** Keeps the highest revision per machine and topic; true when it moved. */
    poke(
      input: {
        machineId: string;
        topic: BridgePokeTopic;
        revision: number;
        observedAt: string;
      },
      now: number,
      budget: number
    ) {
      if (stopped()) return false;
      const current = rows(
        'SELECT revision FROM pokes WHERE machine = ? AND topic = ?',
        input.machineId,
        input.topic
      )[0];
      if (current && Number(current.revision) >= input.revision) return false;
      charge(now, budget);
      rows(
        `INSERT INTO pokes (machine, topic, revision, observed) VALUES (?, ?, ?, ?)
         ON CONFLICT(machine, topic) DO UPDATE SET revision = excluded.revision, observed = excluded.observed`,
        input.machineId,
        input.topic,
        input.revision,
        input.observedAt
      );
      return true;
    },

    pokes(): BridgePoke[] {
      return rows(
        'SELECT machine, topic, revision, observed FROM pokes ORDER BY machine, topic'
      ).map((row) => ({
        machineId: String(row.machine),
        topic: row.topic as BridgePokeTopic,
        revision: Number(row.revision),
        observedAt: String(row.observed),
      }));
    },

    machineConnected(machineId: string, now: number) {
      rows(
        `INSERT INTO machines (machine, connected_at, disconnected_at) VALUES (?, ?, NULL)
         ON CONFLICT(machine) DO UPDATE SET connected_at = excluded.connected_at, disconnected_at = NULL`,
        machineId,
        now
      );
    },

    machineDisconnected(machineId: string, now: number) {
      rows(
        'UPDATE machines SET disconnected_at = ? WHERE machine = ?',
        now,
        machineId
      );
    },

    /** Every machine that ever connected; `connected` comes from live sockets. */
    machines(): Omit<BridgeMachineStatus, 'connected' | 'lastSeenAt'>[] {
      return rows(
        'SELECT machine, connected_at, disconnected_at FROM machines ORDER BY machine'
      ).map((row) => ({
        machineId: String(row.machine),
        ...(row.connected_at === null
          ? {}
          : { connectedAt: Number(row.connected_at) }),
        ...(row.disconnected_at === null
          ? {}
          : { disconnectedAt: Number(row.disconnected_at) }),
      }));
    },
  };
}

export type BridgeEngine = ReturnType<typeof createBridgeEngine>;
