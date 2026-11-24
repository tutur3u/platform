import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  ATTACHMENT_LIMITS,
  type AttachmentReserve,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import { describe, expect, it } from 'vite-plus/test';
import { createAttachmentEngine } from './attachment-engine';
import { BridgeError, createBridgeEngine } from './bridge-engine';
import type { SqlLike } from './engine';

const NOW = Date.UTC(2026, 10, 24, 5, 0, 0);
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const CRED = 'c'.repeat(64);
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

function setup() {
  const db = new DatabaseSync(':memory:');
  // Durable Object SQLite binds and returns BLOBs as ArrayBuffer; node:sqlite
  // takes typed arrays, so the adapter converts on the way in.
  const sql: SqlLike = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const values = (bindings as unknown[]).map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value
      );
      return { toArray: () => statement.all(...(values as never[])) as never };
    },
  };
  const bridge = createBridgeEngine(sql);
  bridge.ensureSchema();
  const files = createAttachmentEngine(sql);
  files.ensureSchema();
  return { bridge, files, db };
}

const reserve = (over: Partial<AttachmentReserve> = {}): AttachmentReserve => ({
  v: 1,
  actorId: ACTOR,
  credential: CRED,
  machineId: 'skr-m4',
  threadId: 'thread:a',
  replyId: uuid(1),
  kind: 'image',
  size: 1000,
  meta: { iv: 'i'.repeat(16), data: 'd'.repeat(40) },
  ...over,
});

const code = (run: () => unknown) => {
  try {
    run();
    return 'ok';
  } catch (error) {
    if (error instanceof BridgeError) return error.code;
    throw error;
  }
};

/** A finalized upload with `bytes`, ready to be bound to its reply. */
function ready(
  files: ReturnType<typeof setup>['files'],
  id: string,
  bytes: Uint8Array,
  over: Partial<AttachmentReserve> = {}
) {
  files.reserve(reserve({ size: bytes.byteLength, ...over }), id, NOW);
  return files.finalize(
    id,
    {
      actorId: over.actorId ?? ACTOR,
      credential: CRED,
      sha256: sha(bytes),
      mime: 'image/webp',
    },
    bytes,
    NOW + 1
  );
}

function storeReply(
  bridge: ReturnType<typeof setup>['bridge'],
  id: string,
  over: { threadId?: string; machineId?: string } = {}
) {
  return bridge.enqueue(
    {
      id,
      machineId: over.machineId ?? 'skr-m4',
      threadId: over.threadId ?? 'thread:a',
      actorId: ACTOR,
      textDigest: 'a'.repeat(64),
      ackKey: 'K'.repeat(43),
      expiresAt: NOW + 3_600_000,
      frame: 'frame',
    },
    NOW + 2,
    1000
  );
}

const bind = (objects: string[], over: Record<string, unknown> = {}) => ({
  replyId: uuid(1),
  machineId: 'skr-m4',
  threadId: 'thread:a',
  actorId: ACTOR,
  credential: CRED,
  objects,
  fetch: objects.map((id) => ({ id, hash: sha(Buffer.from(`cap:${id}`)) })),
  expiresAt: NOW + 3_600_000,
  ...over,
});

describe('attachment engine', () => {
  it('stores derived bytes in chunks and serves them only for the bound capability', () => {
    const { bridge, files } = setup();
    const bytes = new Uint8Array(ATTACHMENT_LIMITS.chunkBytes * 2 + 7).map(
      (_, i) => i % 251
    );
    const record = ready(files, uuid(10), bytes);
    expect(record).toMatchObject({ state: 'ready', size: bytes.byteLength });
    storeReply(bridge, uuid(1));
    files.assertBindable(bind([uuid(10)]), NOW + 3);
    files.bind(bind([uuid(10)]));
    const hash = sha(Buffer.from(`cap:${uuid(10)}`));
    expect(files.fetch(uuid(10), hash, NOW + 4)).toEqual(bytes);
    // A capability derived for another machine hashes to something else.
    expect(files.fetch(uuid(10), sha(Buffer.from('cap:other')), NOW + 4)).toBe(
      null
    );
  });

  it('refuses an upload reused across targets, even with the same digest', () => {
    const { bridge, files } = setup();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    ready(files, uuid(10), bytes);
    // The same bytes reserved for another thread are a separate record.
    ready(files, uuid(11), bytes, {
      replyId: uuid(2),
      threadId: 'thread:b',
    });
    storeReply(bridge, uuid(1));
    // Reply 1 (thread a) cannot name thread b's record, nor move its own to b.
    expect(code(() => files.assertBindable(bind([uuid(11)]), NOW + 3))).toBe(
      'attachment_refused'
    );
    expect(
      code(() =>
        files.assertBindable(
          bind([uuid(10)], { threadId: 'thread:b' }),
          NOW + 3
        )
      )
    ).toBe('attachment_refused');
    expect(
      code(() =>
        files.assertBindable(bind([uuid(10)], { machineId: 'other' }), NOW + 3)
      )
    ).toBe('attachment_refused');
    expect(
      code(() =>
        files.assertBindable(bind([uuid(10)], { actorId: OTHER }), NOW + 3)
      )
    ).toBe('attachment_refused');
    // The store checks the sending session too, not only Web.
    expect(
      code(() =>
        files.assertBindable(
          bind([uuid(10)], { credential: 'f'.repeat(64) }),
          NOW + 3
        )
      )
    ).toBe('attachment_refused');
  });

  it('finalizes once, only for the reserving owner and credential, never past the reservation', () => {
    const { files } = setup();
    files.reserve(reserve({ size: 4 }), uuid(10), NOW);
    const fields = {
      actorId: ACTOR,
      credential: CRED,
      sha256: 'e'.repeat(64),
      mime: 'image/webp' as const,
    };
    expect(
      code(() =>
        files.finalize(
          uuid(10),
          { ...fields, credential: 'f'.repeat(64) },
          new Uint8Array(4),
          NOW
        )
      )
    ).toBe('attachment_refused');
    expect(
      code(() => files.finalize(uuid(10), fields, new Uint8Array(5), NOW))
    ).toBe('bad_request');
    expect(
      code(() => files.finalize(uuid(10), fields, new Uint8Array(4), NOW))
    ).toBe('ok');
    expect(
      code(() => files.finalize(uuid(10), fields, new Uint8Array(4), NOW))
    ).toBe('attachment_refused');
    // A reservation that lapsed cannot be finalized.
    files.reserve(reserve({ size: 4, replyId: uuid(3) }), uuid(11), NOW);
    expect(
      code(() =>
        files.finalize(
          uuid(11),
          fields,
          new Uint8Array(4),
          NOW + ATTACHMENT_LIMITS.reserveTtlMs + 1
        )
      )
    ).toBe('attachment_refused');
  });

  it('holds per-reply, outstanding and hourly quotas before any bytes arrive', () => {
    const { files } = setup();
    for (let n = 0; n < ATTACHMENT_LIMITS.maxFiles; n++)
      files.reserve(reserve({ size: 10 }), uuid(100 + n), NOW);
    expect(
      code(() => files.reserve(reserve({ size: 10 }), uuid(99), NOW))
    ).toBe('full');
    expect(
      code(() =>
        files.reserve(
          reserve({
            replyId: uuid(2),
            size: ATTACHMENT_LIMITS.maxReplyBytes + 1,
          }),
          uuid(98),
          NOW
        )
      )
    ).toBe('full');
    // Another owner or target cannot join a reply that already has files.
    expect(
      code(() =>
        files.reserve(reserve({ threadId: 'thread:z', size: 1 }), uuid(97), NOW)
      )
    ).toBe('attachment_refused');
  });

  it('releases bytes when the reply settles and stops serving them', () => {
    const { bridge, files, db } = setup();
    const bytes = new Uint8Array([9, 9, 9]);
    ready(files, uuid(10), bytes);
    storeReply(bridge, uuid(1));
    files.bind(bind([uuid(10)]));
    files.releaseReply(uuid(1));
    const hash = sha(Buffer.from(`cap:${uuid(10)}`));
    expect(files.fetch(uuid(10), hash, NOW + 5)).toBe(null);
    expect(
      db.prepare('SELECT count(*) AS n FROM attachment_chunks').get()
    ).toEqual({ n: 0 });
    expect(files.records([uuid(10)])[0]).toMatchObject({
      state: 'released',
      sha256: sha(bytes),
    });
    // A sent reply takes no further files.
    expect(code(() => files.reserve(reserve({ size: 1 }), uuid(12), NOW))).toBe(
      'attachment_refused'
    );
  });

  it('bounds fetches per object and refuses them once the reply is no longer waiting', () => {
    const { bridge, files } = setup();
    ready(files, uuid(10), new Uint8Array([1]));
    storeReply(bridge, uuid(1));
    files.bind(bind([uuid(10)]));
    const hash = sha(Buffer.from(`cap:${uuid(10)}`));
    for (let n = 0; n < ATTACHMENT_LIMITS.maxFetchesPerObject; n++)
      expect(files.fetch(uuid(10), hash, NOW + 5)).not.toBe(null);
    expect(files.fetch(uuid(10), hash, NOW + 5)).toBe(null);
  });

  it('expires unfinished uploads during later writes', () => {
    const { files, db } = setup();
    ready(files, uuid(10), new Uint8Array([1, 2]));
    files.sweep(NOW + ATTACHMENT_LIMITS.recordTtlMs + 1);
    expect(files.records([uuid(10)])[0]?.state).toBe('expired');
    expect(
      db.prepare('SELECT count(*) AS n FROM attachment_chunks').get()
    ).toEqual({ n: 0 });
  });
});
