import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUBPROTOCOL,
  bridgeAckSigningString,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const TOKEN = 'service-token-'.padEnd(48, 's');
const OPERATOR = 'operator-token-'.padEnd(48, 'o');
const ORIGIN = 'http://localhost';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const DIGEST = 'a'.repeat(64);
// The machine's acknowledgement key pair; the store only ever sees the public half.
const machineKey = generateKeyPairSync('ed25519');
const ACK_KEY = machineKey.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64url');
/** The signature the machine would put on this acknowledgement. */
const ackSig = (
  ack: { id: string; state: string; delivery?: string; code?: string },
  machineId = 'skr-m4'
) =>
  sign(
    null,
    Buffer.from(
      bridgeAckSigningString({
        id: ack.id,
        machineId,
        state: ack.state as 'delivered',
        ...(ack.delivery ? { delivery: ack.delivery } : {}),
        ...(ack.code ? { code: ack.code } : {}),
        textDigest: DIGEST,
      })
    ),
    machineKey.privateKey
  ).toString('hex');
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let workDir: string;
let scriptPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mastermind-bridge-test-'));
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

function runtime(ops = '1000') {
  return new Miniflare({
    durableObjectsPersist: false,
    modules: true,
    scriptPath,
    modulesRoot: workDir,
    compatibilityDate: '2026-07-01',
    durableObjects: {
      MASTERMIND_STORE: { className: 'MastermindStore', useSQLite: true },
      MASTERMIND_BRIDGE: { className: 'FleetBridge', useSQLite: true },
    },
    bindings: {
      MASTERMIND_STORE_TOKENS: TOKEN,
      MASTERMIND_STORE_OPERATOR_TOKEN: OPERATOR,
      MASTERMIND_BRIDGE_DAILY_OPS: ops,
    },
  });
}

async function call(
  mf: Miniflare,
  path: string,
  body?: unknown,
  token: string | null = TOKEN
) {
  const response = await mf.dispatchFetch(`${ORIGIN}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>,
  };
}

const ticketFor = async (mf: Miniflare, request: Record<string, unknown>) =>
  (
    await call(mf, '/v1/bridge/ticket', {
      v: BRIDGE_PROTOCOL_VERSION,
      ...request,
    })
  ).body.ticket as string;

/** The upgrade status alone, for the refusal cases. */
async function upgradeStatus(mf: Miniflare, ticket: string, protocol?: string) {
  const response = await mf.dispatchFetch(`${ORIGIN}/v1/bridge/connect`, {
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': protocol ?? `${BRIDGE_SUBPROTOCOL}, ${ticket}`,
    },
  });
  return response.status;
}

async function connect(mf: Miniflare, ticket: string) {
  const response = await mf.dispatchFetch(`${ORIGIN}/v1/bridge/connect`, {
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': `${BRIDGE_SUBPROTOCOL}, ${ticket}`,
    },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`connect refused: ${response.status}`);
  const frames: Record<string, any>[] = [];
  const waiting: ((frame: Record<string, any>) => void)[] = [];
  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(String(event.data));
    const next = waiting.shift();
    if (next) next(frame);
    else frames.push(frame);
  });
  socket.accept();
  return {
    status: response.status,
    socket,
    /** Acknowledgements are signed as the machine unless a signature is given. */
    send: (frame: Record<string, unknown>) =>
      socket.send(
        JSON.stringify({
          v: BRIDGE_PROTOCOL_VERSION,
          ...(frame.t === 'ack' ? { sig: ackSig(frame as never) } : {}),
          ...frame,
        })
      ),
    /** The next frame, or a timeout marker so a missing frame fails fast. */
    next: () =>
      frames.length > 0
        ? Promise.resolve(frames.shift()!)
        : new Promise<Record<string, any>>((done) => {
            const timer = setTimeout(() => done({ t: 'timeout' }), 1500);
            waiting.push((frame) => {
              clearTimeout(timer);
              done(frame);
            });
          }),
    pending: () => frames.length,
  };
}

const machine = async (mf: Miniflare, machineId = 'skr-m4') =>
  connect(mf, await ticketFor(mf, { role: 'machine', machineId }));

const send = (mf: Miniflare, n: number, over: Record<string, unknown> = {}) =>
  call(mf, '/v1/bridge/send', {
    v: BRIDGE_PROTOCOL_VERSION,
    envelope: {
      id: uuid(n),
      machineId: 'skr-m4',
      threadId: `thread:project:mcp%3Aabc:${n}`,
      // Sealed by Web; the store relays it without a key for it.
      box: { iv: 'A'.repeat(16), data: `sealed-${n}`.padEnd(40, 'x') },
      textDigest: DIGEST,
      actorId: ACTOR,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    },
    sig: 'c'.repeat(64),
    ackKey: ACK_KEY,
    ...over,
  });

describe('fleet bridge', () => {
  it('admits a socket only with a fresh single-use ticket', async () => {
    const mf = runtime();
    try {
      expect(
        (await call(mf, '/v1/bridge/ticket', { v: 1, role: 'owner' }, null))
          .status
      ).toBe(401);
      expect(
        (await call(mf, '/v1/bridge/ticket', { v: 1, role: 'machine' })).status
      ).toBe(400);
      const ticket = await ticketFor(mf, { role: 'machine', machineId: 'm1' });
      for (const protocol of [
        BRIDGE_SUBPROTOCOL,
        `${BRIDGE_SUBPROTOCOL}, ${'x'.repeat(43)}`,
        `other, ${ticket}`,
      ])
        expect(await upgradeStatus(mf, ticket, protocol)).toBe(401);
      expect(await upgradeStatus(mf, ticket)).toBe(101);
      expect(await upgradeStatus(mf, ticket)).toBe(401);
      // A plain request never reaches a socket.
      const plain = await mf.dispatchFetch(`${ORIGIN}/v1/bridge/connect`);
      expect(plain.status).toBe(426);
    } finally {
      await mf.dispose();
    }
  });

  it('pushes a reply to the connected machine and answers with its acknowledgement', async () => {
    const mf = runtime();
    try {
      // No `hello` here: a reply stored while one is being processed is
      // pushed twice (direct push and replay), which the machine dedupes.
      const link = await machine(mf);
      const pending = send(mf, 1, { waitMs: 2000 });
      const frame = await link.next();
      expect(frame).toMatchObject({
        t: 'reply',
        sig: 'c'.repeat(64),
        envelope: {
          id: uuid(1),
          box: { data: 'sealed-1'.padEnd(40, 'x') },
          actorId: ACTOR,
        },
      });
      link.send({
        t: 'ack',
        id: uuid(1),
        state: 'delivered',
        delivery: 'steered',
      });
      const started = Date.now();
      const { status, body } = await pending;
      expect(status).toBe(200);
      expect(body).toMatchObject({
        replayed: false,
        // The digest and the machine's signature travel with the receipt.
        receipt: {
          state: 'delivered',
          delivery: 'steered',
          textDigest: DIGEST,
          ackSig: ackSig({
            id: uuid(1),
            state: 'delivered',
            delivery: 'steered',
          }),
        },
      });
      // The wait ends on the ack, not on its 2 s timeout.
      expect(Date.now() - started).toBeLessThan(1500);
      // A retry with the same key returns that receipt and pushes nothing.
      expect((await send(mf, 1, { waitMs: 500 })).body).toMatchObject({
        replayed: true,
        receipt: { state: 'delivered', delivery: 'steered' },
      });
      expect(link.pending()).toBe(0);
    } finally {
      await mf.dispose();
    }
  });

  it('holds replies for an offline machine and replays them once on hello', async () => {
    const mf = runtime();
    try {
      const offline = await send(mf, 1, { waitMs: 2000 });
      expect(offline.body.receipt.state).toBe('sent');
      await send(mf, 2);
      const link = await machine(mf);
      // Nothing is pushed before the machine says it is ready.
      expect(link.pending()).toBe(0);
      link.send({ t: 'hello' });
      expect((await link.next()).envelope.id).toBe(uuid(1));
      expect((await link.next()).envelope.id).toBe(uuid(2));
      link.send({
        t: 'ack',
        id: uuid(1),
        state: 'delivered',
        delivery: 'started',
      });
      link.send({
        t: 'ack',
        id: uuid(2),
        state: 'failed',
        code: 'unknown_thread',
      });
      link.send({ t: 'hello' });
      expect((await link.next()).t).toBe('timeout');
      expect(
        (await call(mf, `/v1/bridge/receipt?id=${uuid(1)}`)).body.receipt
      ).toMatchObject({ state: 'delivered', delivery: 'started' });
      expect(
        (await call(mf, `/v1/bridge/receipt?id=${uuid(2)}`)).body.receipt
      ).toMatchObject({ state: 'failed', code: 'unknown_thread' });
      expect((await call(mf, `/v1/bridge/receipt?id=${uuid(3)}`)).body).toEqual(
        {
          ok: true,
          receipt: null,
        }
      );
    } finally {
      await mf.dispose();
    }
  });

  it('keeps one socket per machine and reports presence', async () => {
    const mf = runtime();
    try {
      const first = await machine(mf);
      const second = await machine(mf);
      second.send({ t: 'hello' });
      await send(mf, 1);
      expect((await second.next()).t).toBe('reply');
      // The replaced socket gets nothing and can no longer settle a reply.
      first.send({ t: 'ack', id: uuid(1), state: 'delivered' });
      await new Promise((done) => setTimeout(done, 150));
      expect(first.pending()).toBe(0);
      expect(
        (await call(mf, `/v1/bridge/receipt?id=${uuid(1)}`)).body.receipt.state
      ).toBe('sent');
      const live = (await call(mf, '/v1/bridge/live')).body.live;
      expect(live.machines).toMatchObject([
        { machineId: 'skr-m4', connected: true },
      ]);
    } finally {
      await mf.dispose();
    }
  });

  it('fans receipts, pokes and presence out to owner sockets, which cannot speak', async () => {
    const mf = runtime();
    try {
      const owner = await connect(mf, await ticketFor(mf, { role: 'owner' }));
      const link = await machine(mf);
      expect(await owner.next()).toMatchObject({
        t: 'machine',
        machine: { machineId: 'skr-m4', connected: true },
      });
      link.send({ t: 'hello' });
      await send(mf, 1);
      expect(await owner.next()).toMatchObject({
        t: 'receipt',
        receipt: { id: uuid(1), state: 'sent' },
      });
      // An owner socket cannot settle a reply or move a poke.
      owner.send({ t: 'ack', id: uuid(1), state: 'delivered' });
      owner.send({
        t: 'poke',
        topic: 'usage',
        revision: 9,
        observedAt: new Date().toISOString(),
      });
      await link.next();
      link.send({
        t: 'ack',
        id: uuid(1),
        state: 'delivered',
        delivery: 'steered',
      });
      expect(await owner.next()).toMatchObject({
        t: 'receipt',
        receipt: { state: 'delivered', delivery: 'steered' },
      });
      const observedAt = new Date().toISOString();
      link.send({ t: 'poke', topic: 'usage', revision: 2, observedAt });
      link.send({ t: 'poke', topic: 'usage', revision: 1, observedAt });
      link.send({ t: 'poke', topic: 'made-up', revision: 5, observedAt });
      expect(await owner.next()).toEqual({
        v: 1,
        t: 'poke',
        poke: { machineId: 'skr-m4', topic: 'usage', revision: 2, observedAt },
      });
      expect((await owner.next()).t).toBe('timeout');
      expect((await call(mf, '/v1/bridge/live')).body.live.pokes).toEqual([
        { machineId: 'skr-m4', topic: 'usage', revision: 2, observedAt },
      ]);
    } finally {
      await mf.dispose();
    }
  });

  it('stops everything behind the operator fence and resumes when it is cleared', async () => {
    const mf = runtime();
    try {
      const link = await machine(mf);
      const fence = (stopped: boolean) =>
        call(mf, '/v1/fence', { stopped }, OPERATOR);
      expect((await fence(true)).body).toEqual({ ok: true, stopped: true });
      expect((await send(mf, 1)).status).toBe(503);
      expect(
        (await call(mf, '/v1/bridge/ticket', { v: 1, role: 'owner' })).status
      ).toBe(503);
      expect((await fence(false)).body).toEqual({ ok: true, stopped: false });
      // The fenced socket is gone for good: the machine has to reconnect.
      link.send({ t: 'hello' });
      expect((await send(mf, 1, { waitMs: 300 })).body.receipt.state).toBe(
        'sent'
      );
      expect(link.pending()).toBe(0);
      expect(
        (await call(mf, '/v1/bridge/live')).body.live.machines
      ).toMatchObject([{ machineId: 'skr-m4', connected: false }]);
      const again = await machine(mf);
      again.send({ t: 'hello' });
      expect((await again.next()).envelope.id).toBe(uuid(1));
    } finally {
      await mf.dispose();
    }
  });

  it('serves an outbox replay at most once per interval and charges it', async () => {
    const mf = runtime();
    try {
      await send(mf, 1);
      const ops = async () =>
        (await call(mf, '/v1/status', undefined, OPERATOR)).body.bridge.ops;
      const link = await machine(mf);
      const before = await ops();
      link.send({ t: 'hello' });
      expect((await link.next()).envelope.id).toBe(uuid(1));
      // Asking again straight away replays nothing and costs nothing.
      for (let i = 0; i < 5; i++) link.send({ t: 'hello' });
      expect((await link.next()).t).toBe('timeout');
      expect(await ops()).toBe(before + 1);
      // An acknowledgement is counted too.
      link.send({ t: 'ack', id: uuid(1), state: 'delivered' });
      await new Promise((done) => setTimeout(done, 150));
      expect(await ops()).toBe(before + 2);
    } finally {
      await mf.dispose();
    }
  });

  it('retires a socket that floods messages, whatever they contain', async () => {
    const mf = runtime();
    try {
      for (const junk of [
        JSON.stringify({ v: 1, t: 'hello' }),
        '{not json',
        JSON.stringify({ v: 1, t: 'made-up' }),
      ]) {
        const link = await machine(mf, 'flooder');
        for (let i = 0; i < 310; i++) link.socket.send(junk);
        await new Promise((done) => setTimeout(done, 300));
        expect(
          (await call(mf, '/v1/bridge/live')).body.live.machines
        ).toMatchObject([{ machineId: 'flooder', connected: false }]);
      }
      // An owner socket has nothing to say: a handful of messages retires it.
      const owner = await connect(mf, await ticketFor(mf, { role: 'owner' }));
      for (let i = 0; i < 12; i++) owner.socket.send('x');
      await new Promise((done) => setTimeout(done, 150));
      await send(mf, 1);
      expect((await owner.next()).t).toBe('timeout');
    } finally {
      await mf.dispose();
    }
  });

  it('keeps a reply pending through a forged acknowledgement and settles on the real one', async () => {
    const mf = runtime();
    try {
      const link = await machine(mf);
      await send(mf, 1);
      await link.next();
      const state = async () =>
        (await call(mf, `/v1/bridge/receipt?id=${uuid(1)}`)).body.receipt.state;
      for (const sig of [
        // Well formed but not the machine's.
        '0'.repeat(128),
        // The machine's signature for another outcome or another reply.
        ackSig({ id: uuid(1), state: 'failed', code: 'expired' }),
        ackSig({ id: uuid(2), state: 'delivered', delivery: 'steered' }),
        ackSig({ id: uuid(1), state: 'delivered', delivery: 'steered' }, 'm2'),
      ]) {
        link.send({
          t: 'ack',
          id: uuid(1),
          state: 'delivered',
          delivery: 'steered',
          sig,
        });
        await new Promise((done) => setTimeout(done, 80));
        expect(await state()).toBe('sent');
      }
      // Still in the outbox, so the real machine can still settle it.
      link.send({
        t: 'ack',
        id: uuid(1),
        state: 'delivered',
        delivery: 'steered',
      });
      await new Promise((done) => setTimeout(done, 120));
      expect(await state()).toBe('delivered');
    } finally {
      await mf.dispose();
    }
  });

  it('stops at the daily operation budget', async () => {
    const mf = runtime('2');
    try {
      expect((await send(mf, 1)).status).toBe(200);
      expect((await send(mf, 2)).status).toBe(200);
      const refused = await send(mf, 3);
      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({ ok: false, error: 'budget' });
      // A retry of a stored reply is still answered: it costs nothing.
      expect((await send(mf, 1)).body.replayed).toBe(true);
    } finally {
      await mf.dispose();
    }
  });

  it('drops an acknowledgement without a machine signature and a plain-text reply', async () => {
    const mf = runtime();
    try {
      const link = await machine(mf);
      await send(mf, 1);
      await link.next();
      link.socket.send(
        JSON.stringify({ v: 1, t: 'ack', id: uuid(1), state: 'delivered' })
      );
      await new Promise((done) => setTimeout(done, 150));
      expect(
        (await call(mf, `/v1/bridge/receipt?id=${uuid(1)}`)).body.receipt.state
      ).toBe('sent');
      // The store refuses a reply that carries readable text.
      const plain = await call(mf, '/v1/bridge/send', {
        v: 1,
        envelope: {
          id: uuid(2),
          machineId: 'skr-m4',
          threadId: 'thread:x',
          text: 'readable',
          textDigest: DIGEST,
          actorId: ACTOR,
          issuedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
        sig: 'c'.repeat(64),
        ackKey: ACK_KEY,
      });
      expect(plain.status).toBe(400);
    } finally {
      await mf.dispose();
    }
  });

  it('rejects malformed sends before they reach the outbox', async () => {
    const mf = runtime();
    try {
      for (const over of [
        { sig: 'short' },
        { envelope: { id: 'not-a-uuid' } },
        { waitMs: 60_000 },
      ])
        expect((await send(mf, 1, over)).status).toBe(400);
      const oversized = await call(mf, '/v1/bridge/send', {
        junk: 'x'.repeat(80 * 1024),
      });
      expect(oversized.status).toBe(400);
      expect((await call(mf, '/v1/bridge/receipt?id=nope')).status).toBe(400);
    } finally {
      await mf.dispose();
    }
  });
});
