import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BRIDGE_PROTOCOL_VERSION,
  bridgeAckSigningString,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import {
  ATTACHMENT_CAPABILITY,
  ATTACHMENT_FINALIZE_HEADER,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import { build } from 'esbuild';
import type { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import {
  ACTOR,
  createBridgeTestRuntime,
  ORIGIN,
  openBridgeSocket,
  TOKEN,
  uuid,
} from './bridge-test-runtime';

const BUNDLE = 'b'.repeat(64);
const CRED = 'c'.repeat(64);
const THREAD = 'thread:project:mcp%3Aabc:1';
const machineKey = generateKeyPairSync('ed25519');
const ACK_KEY = machineKey.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64url');
const ackSig = (ack: { id: string; state: string; code?: string }) =>
  sign(
    null,
    Buffer.from(
      bridgeAckSigningString({
        id: ack.id,
        machineId: 'skr-m4',
        state: ack.state as 'failed',
        ...(ack.code ? { code: ack.code } : {}),
        textDigest: BUNDLE,
      })
    ),
    machineKey.privateKey
  ).toString('hex');
const sha = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const CAPABILITY = 'f'.repeat(64);

let workDir: string;
let scriptPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mastermind-attachments-test-'));
  scriptPath = join(workDir, 'worker.mjs');
  await build({
    entryPoints: [resolve(import.meta.dirname, 'worker.ts')],
    outfile: scriptPath,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    external: ['cloudflare:*'],
    logLevel: 'silent',
  });
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function call(
  mf: Miniflare,
  path: string,
  init: {
    body?: unknown;
    raw?: Uint8Array;
    headers?: Record<string, string>;
  } = {}
) {
  const response = await mf.dispatchFetch(`${ORIGIN}${path}`, {
    method: init.raw ? 'PUT' : init.body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, ...init.headers },
    ...(init.raw ? { body: init.raw } : {}),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>,
  };
}

async function machine(mf: Miniflare, caps?: string[]) {
  const ticket = (
    await call(mf, '/v1/bridge/ticket', {
      body: { v: 1, role: 'machine', machineId: 'skr-m4' },
    })
  ).body.ticket as string;
  const link = await openBridgeSocket(mf, ticket, ackSig as never);
  link.socket.send(
    JSON.stringify({
      v: BRIDGE_PROTOCOL_VERSION,
      t: 'hello',
      ...(caps ? { caps } : {}),
    })
  );
  // The hello is processed before the next request reaches the object.
  await new Promise((done) => setTimeout(done, 100));
  return link;
}

/** Reserve and finalize one upload for reply `uuid(1)`. */
async function upload(mf: Miniflare, bytes: Uint8Array, replyId = uuid(1)) {
  const reserved = await call(mf, '/v1/bridge/attachments/reserve', {
    body: {
      v: 1,
      actorId: ACTOR,
      credential: CRED,
      machineId: 'skr-m4',
      threadId: THREAD,
      replyId,
      kind: 'image',
      size: bytes.byteLength,
      meta: { iv: 'i'.repeat(16), data: 'd'.repeat(40) },
    },
  });
  expect(reserved.status).toBe(200);
  const id = reserved.body.id as string;
  const done = await call(mf, `/v1/bridge/attachments/object?id=${id}`, {
    raw: bytes,
    headers: {
      [ATTACHMENT_FINALIZE_HEADER]: JSON.stringify({
        actorId: ACTOR,
        credential: CRED,
        mime: 'image/webp',
      }),
    },
  });
  // The store computes the digest of what it stored.
  expect(done).toMatchObject({
    status: 200,
    body: { record: { state: 'ready', sha256: sha(bytes) } },
  });
  return id;
}

const sendV2 = (
  mf: Miniflare,
  objects: string[],
  envelope: Record<string, unknown> = {}
) =>
  call(mf, '/v1/bridge/send2', {
    body: {
      v: 2,
      envelope: {
        id: uuid(1),
        machineId: 'skr-m4',
        threadId: THREAD,
        box: { iv: 'A'.repeat(16), data: 'sealed'.padEnd(40, 'x') },
        textDigest: BUNDLE,
        objects,
        actorId: ACTOR,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        ...envelope,
      },
      sig: 'c'.repeat(64),
      ackKey: ACK_KEY,
      fetch: objects.map((id) => ({ id, hash: sha(CAPABILITY) })),
    },
  });

const fetchObject = (mf: Miniflare, id: string, capability = CAPABILITY) =>
  mf.dispatchFetch(`${ORIGIN}/v1/bridge/attachments/fetch?id=${id}`, {
    headers: { authorization: `MM-Fetch ${capability}` },
  });

describe('reply attachments on the bridge', () => {
  it('refuses a v2 reply unless the live machine advertised attachments', async () => {
    const mf = createBridgeTestRuntime(scriptPath, workDir, '1000');
    try {
      const id = await upload(mf, new Uint8Array([1, 2, 3]));
      expect((await sendV2(mf, [id])).body).toEqual({
        ok: false,
        error: 'offline',
      });
      const link = await machine(mf);
      expect((await sendV2(mf, [id])).body).toEqual({
        ok: false,
        error: 'unsupported',
      });
      link.socket.close();
    } finally {
      await mf.dispose();
    }
  });

  it('serves an object only to its capability while the reply waits, then releases it', async () => {
    const mf = createBridgeTestRuntime(scriptPath, workDir, '1000');
    try {
      const bytes = new Uint8Array([5, 6, 7, 8]);
      const id = await upload(mf, bytes);
      const link = await machine(mf, [ATTACHMENT_CAPABILITY]);
      // An object fetched before its reply exists is refused.
      expect((await fetchObject(mf, id)).status).toBe(404);
      const sent = await sendV2(mf, [id]);
      expect(sent.body).toMatchObject({ ok: true, replayed: false });
      expect(await link.next()).toMatchObject({
        v: 2,
        t: 'reply',
        envelope: { id: uuid(1), objects: [id] },
      });
      expect((await fetchObject(mf, id, 'e'.repeat(64))).status).toBe(404);
      const good = await fetchObject(mf, id);
      expect(good.status).toBe(200);
      expect(new Uint8Array(await good.arrayBuffer())).toEqual(bytes);
      // A repeat with another bundle under the same id conflicts.
      expect(
        (await sendV2(mf, [id], { textDigest: 'd'.repeat(64) })).body
      ).toEqual({ ok: false, error: 'conflict' });
      // The same bundle replays the first receipt.
      expect((await sendV2(mf, [id])).body).toMatchObject({ replayed: true });
      // A v1 bridge refuses the v2 frame with a closed code: terminal.
      link.send({
        t: 'ack',
        id: uuid(1),
        state: 'failed',
        code: 'bad_signature',
      });
      await new Promise((done) => setTimeout(done, 100));
      const receipt = await call(mf, `/v1/bridge/receipt?id=${uuid(1)}`);
      expect(receipt.body.receipt).toMatchObject({
        state: 'failed',
        code: 'bad_signature',
      });
      expect((await fetchObject(mf, id)).status).toBe(404);
      const records = await call(mf, '/v1/bridge/attachments/records', {
        body: { v: 1, ids: [id] },
      });
      expect(records.body.records[0]).toMatchObject({ state: 'released' });
      link.socket.close();
    } finally {
      await mf.dispose();
    }
  });

  it('caps the finalize body at ingress and refuses a second finalize', async () => {
    const mf = createBridgeTestRuntime(scriptPath, workDir, '1000');
    try {
      const id = await upload(mf, new Uint8Array([1]));
      const again = await call(mf, `/v1/bridge/attachments/object?id=${id}`, {
        raw: new Uint8Array([1]),
        headers: {
          [ATTACHMENT_FINALIZE_HEADER]: JSON.stringify({
            actorId: ACTOR,
            credential: CRED,
            mime: 'image/webp',
          }),
        },
      });
      expect(again.body).toEqual({ ok: false, error: 'attachment_refused' });
      const oversize = await call(
        mf,
        `/v1/bridge/attachments/object?id=${uuid(77)}`,
        {
          raw: new Uint8Array(10 * 1024 * 1024 + 1),
          headers: {
            [ATTACHMENT_FINALIZE_HEADER]: JSON.stringify({
              actorId: ACTOR,
              credential: CRED,
              mime: 'image/webp',
            }),
          },
        }
      );
      expect(oversize.body).toEqual({ ok: false, error: 'bad_request' });
      // Without the service token nothing is reserved.
      const anonymous = await mf.dispatchFetch(
        `${ORIGIN}/v1/bridge/attachments/reserve`,
        { method: 'POST', body: '{}' }
      );
      expect(anonymous.status).toBe(401);
    } finally {
      await mf.dispose();
    }
  });
});
