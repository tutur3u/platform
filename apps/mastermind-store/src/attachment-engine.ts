/**
 * Storage engine of reply attachments, beside the bridge engine in the
 * FleetBridge Durable Object: one record per upload and the derived bytes in
 * fixed-size chunk rows. Every call runs inside the object's transaction.
 *
 * A record is minted here (`reserve`) bound to the owner, the reserving
 * credential, the machine, the thread and the reply id, and moves one way:
 * reserved -> ready (finalized once with the derived bytes) -> bound (a v2
 * reply names it) -> released (the reply settled or expired; bytes deleted),
 * or -> expired. Byte and count quotas are reserved before Web accepts any
 * bytes; the stop fence refuses new work; expiry and retention run a few rows
 * at a time during writes (no alarms).
 */
import {
  ATTACHMENT_LIMITS,
  ATTACHMENT_MIME,
  type AttachmentFinalize,
  type AttachmentRecord,
  type AttachmentReserve,
  type AttachmentState,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import { BridgeError } from './bridge-engine';
import type { SqlLike } from './engine';

type Row = Record<string, unknown>;
type Binding = string | number | null | ArrayBuffer;

/** Uploads and bytes that still occupy storage. */
const LIVE_STATES = "('reserved', 'ready', 'bound')";

function toRecord(row: Row): AttachmentRecord {
  return {
    id: String(row.id),
    actorId: String(row.actor),
    credential: String(row.cred),
    machineId: String(row.machine),
    threadId: String(row.thread),
    replyId: String(row.reply),
    kind: row.kind as AttachmentRecord['kind'],
    size: Number(row.size),
    state: row.state as AttachmentState,
    meta: { iv: String(row.meta_iv), data: String(row.meta_data) },
    ...(row.sha ? { sha256: String(row.sha) } : {}),
    ...(row.mime ? { mime: String(row.mime) } : {}),
    createdAt: Number(row.at),
    ...(row.done_at === null || row.done_at === undefined
      ? {}
      : { finalizedAt: Number(row.done_at) }),
    expiresAt: Number(row.exp),
  };
}

export interface BindInput {
  replyId: string;
  machineId: string;
  threadId: string;
  actorId: string;
  credential: string;
  objects: string[];
  fetch: { id: string; hash: string }[];
  expiresAt: number;
}

export function createAttachmentEngine(sql: SqlLike) {
  // BLOBs bind as ArrayBuffer in Durable Object SQLite; SqlLike names the
  // scalar bindings the other engines use.
  const rows = (query: string, ...b: Binding[]) =>
    sql.exec(query, ...(b as (string | number | null)[])).toArray();
  const count = (query: string, ...b: Binding[]) =>
    Number(rows(query, ...b)[0]?.n ?? 0);
  const record = (id: string) =>
    rows('SELECT * FROM attachments WHERE id = ?', id)[0];

  function ensureSchema() {
    rows(
      `CREATE TABLE IF NOT EXISTS attachments (
         id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL,
         cred TEXT NOT NULL, machine TEXT NOT NULL, thread TEXT NOT NULL,
         reply TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL,
         state TEXT NOT NULL, meta_iv TEXT NOT NULL, meta_data TEXT NOT NULL,
         sha TEXT, mime TEXT, done_at INTEGER, exp INTEGER NOT NULL,
         fetch_hash TEXT, fetches INTEGER NOT NULL DEFAULT 0, quota INTEGER)`
    );
    // Stores created before the quota column hold their reservation in size.
    const columns = new Set(
      rows('PRAGMA table_info(attachments)').map((column) => column.name)
    );
    if (!columns.has('quota'))
      rows('ALTER TABLE attachments ADD COLUMN quota INTEGER');
    rows('CREATE INDEX IF NOT EXISTS attachments_reply ON attachments (reply)');
    rows('CREATE INDEX IF NOT EXISTS attachments_at ON attachments (at)');
    rows(
      `CREATE TABLE IF NOT EXISTS attachment_chunks (
         id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL,
         PRIMARY KEY (id, n))`
    );
  }

  function dropBytes(id: string, state: 'released' | 'expired') {
    rows('DELETE FROM attachment_chunks WHERE id = ?', id);
    rows(
      `UPDATE attachments SET state = ? WHERE id = ? AND state IN ${LIVE_STATES}`,
      state,
      id
    );
  }

  /**
   * Expires overdue uploads, releases those whose reply settled or expired,
   * and forgets old records, a few rows per write.
   */
  function sweep(now: number) {
    const limit = ATTACHMENT_LIMITS.maxFiles * 4;
    for (const row of rows(
      `SELECT id FROM attachments WHERE state IN ('reserved', 'ready') AND exp <= ? LIMIT ?`,
      now,
      limit
    ))
      dropBytes(String(row.id), 'expired');
    for (const row of rows(
      `SELECT a.id FROM attachments a LEFT JOIN replies r ON r.id = a.reply
        WHERE a.state = 'bound' AND (r.id IS NULL OR r.state != 'sent' OR r.exp <= ?)
        LIMIT ?`,
      now,
      limit
    ))
      dropBytes(String(row.id), 'released');
    rows(
      `DELETE FROM attachments WHERE id IN (
         SELECT id FROM attachments WHERE state IN ('released', 'expired') AND exp <= ? LIMIT ?)`,
      now - ATTACHMENT_LIMITS.recordRetentionMs,
      limit
    );
  }

  return {
    ensureSchema,
    sweep,

    /** Mints a record after every quota holds; the bytes come later. */
    reserve(input: AttachmentReserve, id: string, now: number) {
      sweep(now);
      const forReply = rows(
        `SELECT count(*) AS n, coalesce(sum(size), 0) AS bytes FROM attachments
          WHERE reply = ? AND state IN ${LIVE_STATES}`,
        input.replyId
      )[0];
      const conflicting = count(
        `SELECT count(*) AS n FROM attachments WHERE reply = ? AND state != 'expired'
           AND (actor != ? OR machine != ? OR thread != ? OR state IN ('bound', 'released'))`,
        input.replyId,
        input.actorId,
        input.machineId,
        input.threadId
      );
      // A reply's files share one owner and target, and a sent reply takes no more.
      if (conflicting > 0) throw new BridgeError('attachment_refused');
      if (
        Number(forReply?.n ?? 0) + 1 > ATTACHMENT_LIMITS.maxFiles ||
        Number(forReply?.bytes ?? 0) + input.size >
          ATTACHMENT_LIMITS.maxReplyBytes
      )
        throw new BridgeError('full');
      // An image may grow when re-encoded, so it holds the full file cap of
      // storage until finalize releases what the derived bytes do not use.
      const quota =
        input.kind === 'image' ? ATTACHMENT_LIMITS.maxFileBytes : input.size;
      const live = rows(
        `SELECT count(*) AS n, coalesce(sum(coalesce(quota, size)), 0) AS bytes
           FROM attachments WHERE state IN ${LIVE_STATES}`
      )[0];
      const hour = rows(
        `SELECT count(*) AS n, coalesce(sum(coalesce(quota, size)), 0) AS bytes
           FROM attachments WHERE at > ?`,
        now - 3_600_000
      )[0];
      if (
        Number(live?.n ?? 0) + 1 > ATTACHMENT_LIMITS.maxOutstandingUploads ||
        Number(live?.bytes ?? 0) + quota > ATTACHMENT_LIMITS.maxOutstandingBytes
      )
        throw new BridgeError('full');
      if (
        Number(hour?.n ?? 0) + 1 > ATTACHMENT_LIMITS.maxHourlyUploads ||
        Number(hour?.bytes ?? 0) + quota > ATTACHMENT_LIMITS.maxHourlyBytes
      )
        throw new BridgeError('rate_limited');
      const expiresAt = now + ATTACHMENT_LIMITS.reserveTtlMs;
      rows(
        `INSERT INTO attachments (id, at, actor, cred, machine, thread, reply, kind,
           size, quota, state, meta_iv, meta_data, exp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
        id,
        now,
        input.actorId,
        input.credential,
        input.machineId,
        input.threadId,
        input.replyId,
        input.kind,
        input.size,
        quota,
        input.meta.iv,
        input.meta.data,
        expiresAt
      );
      return expiresAt;
    },

    /**
     * Stores the derived bytes of a reserved record, once, for the owner and
     * credential that reserved it: never larger than its reserved quota, and
     * of the one type its kind allows. The unused quota is released.
     */
    finalize(
      id: string,
      input: AttachmentFinalize & { sha256: string },
      bytes: Uint8Array,
      now: number
    ) {
      sweep(now);
      const row = record(id);
      if (
        !row ||
        row.state !== 'reserved' ||
        Number(row.exp) <= now ||
        row.actor !== input.actorId ||
        row.cred !== input.credential
      )
        throw new BridgeError('attachment_refused');
      const kind = row.kind as AttachmentRecord['kind'];
      if (
        input.mime !== ATTACHMENT_MIME[kind] ||
        bytes.byteLength < 1 ||
        bytes.byteLength > Number(row.quota ?? row.size)
      )
        throw new BridgeError('bad_request');
      const step = ATTACHMENT_LIMITS.chunkBytes;
      for (let offset = 0, n = 0; offset < bytes.byteLength; n++) {
        const end = Math.min(offset + step, bytes.byteLength);
        rows(
          'INSERT INTO attachment_chunks (id, n, data) VALUES (?, ?, ?)',
          id,
          n,
          bytes.slice(offset, end).buffer
        );
        offset = end;
      }
      rows(
        `UPDATE attachments SET state = 'ready', sha = ?, mime = ?, size = ?,
           quota = ?, done_at = ?, exp = ? WHERE id = ?`,
        input.sha256,
        input.mime,
        bytes.byteLength,
        bytes.byteLength,
        now,
        Number(row.at) + ATTACHMENT_LIMITS.recordTtlMs,
        id
      );
      return toRecord(record(id)!);
    },

    records(ids: string[]) {
      return ids.map((id) => {
        const row = record(id);
        return row ? toRecord(row) : null;
      });
    },

    /**
     * Refuses a v2 reply unless every object is a ready record of this very
     * reply, owner and target, the fetch list names exactly those objects,
     * and the reply ends no later than its files.
     */
    assertBindable(input: BindInput, now: number) {
      sweep(now);
      const fetchIds = input.fetch.map((entry) => entry.id);
      if (
        new Set(input.objects).size !== input.objects.length ||
        fetchIds.length !== input.objects.length ||
        fetchIds.some((id, index) => id !== input.objects[index])
      )
        throw new BridgeError('bad_request');
      let total = 0;
      for (const id of input.objects) {
        const row = record(id);
        if (
          !row ||
          row.state !== 'ready' ||
          row.reply !== input.replyId ||
          row.actor !== input.actorId ||
          row.cred !== input.credential ||
          row.machine !== input.machineId ||
          row.thread !== input.threadId ||
          Number(row.exp) <= now ||
          input.expiresAt > Number(row.exp)
        )
          throw new BridgeError('attachment_refused');
        total += Number(row.size);
      }
      if (total > ATTACHMENT_LIMITS.maxReplyBytes)
        throw new BridgeError('bad_request');
    },

    /** Marks each object as bound to the reply with its fetch capability hash. */
    bind(input: BindInput) {
      for (const entry of input.fetch)
        rows(
          `UPDATE attachments SET state = 'bound', fetch_hash = ? WHERE id = ? AND state = 'ready'`,
          entry.hash,
          entry.id
        );
    },

    /**
     * The bytes of a bound object, for the capability Web registered with
     * its reply, while that reply is still waiting for its machine. Null for
     * anything else, with no hint of why.
     */
    fetch(id: string, capabilityHash: string, now: number) {
      const row = rows(
        `SELECT a.*, r.state AS reply_state, r.exp AS reply_exp, r.machine AS reply_machine
           FROM attachments a JOIN replies r ON r.id = a.reply WHERE a.id = ?`,
        id
      )[0];
      if (
        !row ||
        row.state !== 'bound' ||
        typeof row.fetch_hash !== 'string' ||
        row.fetch_hash !== capabilityHash ||
        row.reply_state !== 'sent' ||
        row.reply_machine !== row.machine ||
        Number(row.reply_exp) <= now ||
        Number(row.fetches) >= ATTACHMENT_LIMITS.maxFetchesPerObject
      )
        return null;
      rows(
        'UPDATE attachments SET fetches = fetches + 1 WHERE id = ?',
        String(row.id)
      );
      const chunks = rows(
        'SELECT data FROM attachment_chunks WHERE id = ? ORDER BY n',
        id
      );
      const size = Number(row.size);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        const part = new Uint8Array(chunk.data as ArrayBuffer);
        if (offset + part.byteLength > size) return null;
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return offset === size ? bytes : null;
    },

    /** Deletes a settled reply's bytes; the records stay for retries and audit. */
    releaseReply(replyId: string) {
      for (const row of rows(
        `SELECT id FROM attachments WHERE reply = ? AND state = 'bound'`,
        replyId
      ))
        dropBytes(String(row.id), 'released');
    },

    status() {
      return {
        attachments: count(
          `SELECT count(*) AS n FROM attachments WHERE state IN ${LIVE_STATES}`
        ),
      };
    },
  };
}

export type AttachmentEngine = ReturnType<typeof createAttachmentEngine>;
