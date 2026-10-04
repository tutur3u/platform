import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  type ChannelTicket,
  channelTicketSchema,
} from '../../../packages/realtime/src/channels/schema';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  Y,
} from '../../../packages/realtime/src/documents';
import { richTextDocumentContent } from '../../../packages/realtime/src/documents/server';

const worker = new URL(
  process.env.PROGRAMMING_LOCAL_WORKER_URL ?? 'http://127.0.0.1:8876'
);
assert(['127.0.0.1', 'localhost'].includes(worker.hostname));
const secret = process.env.PROGRAMMING_LOCAL_TOKEN_SECRET;
assert(secret);
const ownerId = randomUUID();
const documentId = randomUUID();
const topic = `meeting-document-${randomUUID()}`;
const checkpoints: { state: number[]; version: number }[] = [];
let rejectCheckpoint = false;
const sockets: WebSocket[] = [];
const docs: Y.Doc[] = [];
const awarenessInstances: Awareness[] = [];
const callback = Bun.serve({
  hostname: '127.0.0.1',
  port: 8877,
  async fetch(request) {
    const raw = request.headers
      .get('Authorization')
      ?.match(/^Bearer (\S+)$/)?.[1];
    const parsed = channelTicketSchema.safeParse(
      verifyRealtimePayload(raw ?? '', secret)
    );
    if (
      !parsed.success ||
      parsed.data.topic !== topic ||
      parsed.data.documentId !== documentId ||
      parsed.data.ownerId !== ownerId ||
      parsed.data.kind !== 'document-checkpoint'
    )
      return new Response(null, { status: 403 });
    const body = (await request.json()) as { state: number[]; hash: string };
    assert.equal(
      createHash('sha256').update(Uint8Array.from(body.state)).digest('hex'),
      body.hash
    );
    assert.equal(
      richTextDocumentContent(Uint8Array.from(body.state)).type,
      'doc'
    );
    if (rejectCheckpoint) return new Response(null, { status: 409 });
    checkpoints.push({ state: body.state, version: parsed.data.version! });
    return Response.json({ revision: parsed.data.version });
  },
});
function token(userId: string, overrides: Partial<ChannelTicket> = {}) {
  return signRealtimePayload(
    {
      aud: 'tuturuuu.channels',
      kind: 'join',
      topic,
      userId,
      ownerId,
      documentId,
      role: 'editor',
      version: 0,
      exp: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    },
    secret
  );
}
async function join(userId: string, overrides: Partial<ChannelTicket> = {}) {
  const doc = new Y.Doc();
  docs.push(doc);
  const awareness = new Awareness(doc);
  awarenessInstances.push(awareness);
  const received: { type: string; event?: string; payload?: unknown }[] = [];
  const url = new URL('/channels', worker);
  url.protocol = 'ws:';
  url.searchParams.set('token', token(userId, overrides));
  const socket = new WebSocket(url);
  sockets.push(socket);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    received.push(message);
    if (message.type === 'broadcast' && message.event === 'message')
      Y.applyUpdate(doc, Uint8Array.from(message.payload), 'wire');
    if (message.type === 'broadcast' && message.event === 'awareness')
      applyAwarenessUpdate(awareness, Uint8Array.from(message.payload), 'wire');
  });
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Join timed out')),
      5000
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(deadline);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(deadline);
        reject(new Error('Join failed'));
      },
      { once: true }
    );
  });
  const update = (bytes: Uint8Array) =>
    socket.send(
      JSON.stringify({
        type: 'broadcast',
        event: 'message',
        payload: Array.from(bytes),
      })
    );
  doc.on('update', (bytes, origin) => {
    if (origin !== 'wire') update(bytes);
  });
  return { doc, awareness, socket, received, update };
}
async function until(check: () => boolean, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    assert(
      Date.now() < deadline,
      `Expected document event did not arrive; checkpoints=${checkpoints.length}`
    );
    await Bun.sleep(10);
  }
}
try {
  const firstUser = randomUUID();
  const secondUser = randomUUID();
  const first = await join(firstUser);
  const second = await join(secondUser);
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  text.insert(0, 'Hello');
  paragraph.insert(0, [text]);
  first.doc.getXmlFragment('prosemirror').insert(0, [paragraph]);
  await until(() =>
    second.doc.getXmlFragment('prosemirror').toString().includes('Hello')
  );
  const firstText = (
    first.doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement
  ).get(0) as Y.XmlText;
  const secondText = (
    second.doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement
  ).get(0) as Y.XmlText;
  firstText.insert(5, ' web');
  secondText.insert(5, ' mobile');
  await until(
    () =>
      first.doc.getXmlFragment('prosemirror').toString() ===
      second.doc.getXmlFragment('prosemirror').toString()
  );
  assert(
    firstText.toString().includes('web') &&
      firstText.toString().includes('mobile')
  );
  first.awareness.setLocalState({
    user: { id: 'spoof', name: 'Alex' },
    cursor: { anchor: 1 },
  });
  first.socket.send(
    JSON.stringify({
      type: 'broadcast',
      event: 'awareness',
      payload: Array.from(
        encodeAwarenessUpdate(first.awareness, [first.doc.clientID])
      ),
    })
  );
  await until(
    () =>
      second.awareness.getStates().get(first.doc.clientID)?.user?.id ===
      firstUser
  );
  first.socket.close();
  await until(() => !second.awareness.getStates().has(first.doc.clientID));
  await until(() =>
    checkpoints.some((checkpoint) =>
      richTextDocumentContent(
        Uint8Array.from(checkpoint.state)
      ).content?.[0]?.content?.[0]?.text?.includes('mobile')
    )
  );
  const snapshotToken = token(secondUser, { kind: 'document' });
  const snapshot = await fetch(new URL('/channels/document', worker), {
    headers: { Authorization: `Bearer ${snapshotToken}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(snapshot.status, 200);
  const state = (await snapshot.json()) as { state: number[] };
  const reconstructed = new Y.Doc();
  docs.push(reconstructed);
  Y.applyUpdate(reconstructed, Uint8Array.from(state.state));
  assert.equal(
    reconstructed.getXmlFragment('prosemirror').toString(),
    second.doc.getXmlFragment('prosemirror').toString()
  );
  const shortUser = randomUUID();
  const refreshed = await join(shortUser, {
    exp: Math.floor(Date.now() / 1000) + 2,
  });
  refreshed.socket.send(
    JSON.stringify({ type: 'authenticate', token: token(shortUser) })
  );
  await Bun.sleep(2200);
  assert.equal(refreshed.socket.readyState, WebSocket.OPEN);
  const denied = new Promise<number>((resolve) =>
    refreshed.socket.addEventListener('close', (event) => resolve(event.code), {
      once: true,
    })
  );
  refreshed.socket.send(
    JSON.stringify({ type: 'authenticate', token: token(randomUUID()) })
  );
  assert.equal(await denied, 1008);
  rejectCheckpoint = true;
  // The first peer departed; edit through the still-admitted second peer.
  secondText.insert(0, 'checkpoint ');
  const hasStatus = (peer: typeof second, status: string) =>
    peer.received.some(
      (message) =>
        message.event === 'document-checkpoint' &&
        (message.payload as { status?: string })?.status === status
    );
  await until(() => hasStatus(second, 'conflict'));
  const rejoined = await join(randomUUID());
  await until(() => hasStatus(rejoined, 'conflict'));
  rejectCheckpoint = false;
  await until(() => {
    const latest = second.received.findLast(
      (message) => message.event === 'document-checkpoint'
    );
    return (
      (latest?.payload as { status?: string } | undefined)?.status === 'saved'
    );
  }, 30000);
  const spoof = await join(randomUUID());
  const spoofClosed = new Promise<number>((resolve) =>
    spoof.socket.addEventListener('close', (event) => resolve(event.code), {
      once: true,
    })
  );
  spoof.socket.send(
    JSON.stringify({
      type: 'broadcast',
      event: 'document-checkpoint',
      payload: { status: 'saved', version: 999 },
    })
  );
  assert.equal(await spoofClosed, 1008);
  console.log(
    'Cloudflare document local integration passed: concurrent rich text, signed checkpoint, durable snapshot, account-bound caret, departure, in-place refresh and refresh scope denial, checkpoint conflict/recovery/rejoin and save-status spoof denial'
  );
} finally {
  for (const socket of sockets) socket.close();
  for (const awareness of awarenessInstances) awareness.destroy();
  for (const doc of docs) doc.destroy();
  callback.stop(true);
}
