import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Y } from '../../../packages/realtime/src/collaboration/server.ts';
import { ChannelRoomDurableObject } from './channel-room-do';

const meeting = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';
const topic = `meeting-document-${meeting}`;
function fixture() {
  const doc = new Y.Doc();
  doc.getXmlFragment('prosemirror').insert(0, [new Y.XmlElement('paragraph')]);
  const values = new Map<string, unknown>([
    ['document', Y.encodeStateAsUpdate(doc)],
  ]);
  doc.destroy();
  const alarms: number[] = [];
  const state = {
    storage: {
      async get(key: string) {
        return structuredClone(values.get(key));
      },
      async put(key: string | Record<string, unknown>, value?: unknown) {
        for (const [k, v] of typeof key === 'string'
          ? [[key, value]]
          : Object.entries(key))
          values.set(k as string, structuredClone(v));
      },
      async getAlarm() {
        return null;
      },
      async setAlarm(at: number) {
        alarms.push(at);
      },
    },
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    getWebSockets: () => [],
    waitUntil() {},
  };
  const room = () =>
    new ChannelRoomDurableObject(state as unknown as DurableObjectState, {
      CHANNEL_ROOM: {} as DurableObjectNamespace,
      MEET_REALTIME_TOKEN_SECRET: 'fixture-only',
      MEET_ERASE_CALLBACK_KEY_V1: 'fixture-service-key',
      MEET_ERASE_DO_PROTOCOL: 'true',
      PLATFORM_API_BASE_URL: 'https://fixture.invalid',
    });
  const read = (r = room()) =>
    r.fetch(
      new Request('https://fixture.invalid/channels/document', {
        headers: {
          'x-channel-ticket': JSON.stringify({
            kind: 'document',
            topic,
            documentId,
            ownerId,
            exp: Math.floor(Date.now() / 1000) + 30,
            docGeneration: 0,
          }),
        },
      })
    );
  return { values, room, read, alarms };
}
for (const reason of [
  'doc_hold',
  'restore_hold',
  'pending_document',
  'unreachable',
  'ahead',
]) {
  test(`cold load refuses ${reason} without returning old bytes`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      reason === 'unreachable'
        ? new Response(null, { status: 503 })
        : Response.json({
            doc_generation: reason === 'ahead' ? 1 : 0,
            doc_hold: reason === 'doc_hold',
            restore_hold: reason === 'restore_hold',
            document_store_states:
              reason === 'pending_document' ? { 'S-DL': 'pending' } : {},
          });
    try {
      const f = fixture();
      assert.equal((await f.read()).status, 423);
    } finally {
      globalThis.fetch = original;
    }
  });
}
for (const operation of ['self', 'released-leave']) {
  test(`evicted ${operation} remains available while S-X and history are held`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({
        doc_generation: 0,
        doc_hold: false,
        restore_hold: false,
        active_operation_key: 'fixture-operation',
        document_store_states: { 'S-X:cache': 'held', 'S-DH': 'held' },
      });
    try {
      const f = fixture();
      assert.equal((await f.read()).status, 200);
      assert.equal((await f.read(f.room())).status, 200);
    } finally {
      globalThis.fetch = original;
    }
  });
}
test('persisted freeze survives eviction', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      doc_generation: 0,
      doc_hold: false,
      restore_hold: false,
      document_store_states: {},
    });
  try {
    const f = fixture();
    f.values.set('erase', {
      installedGeneration: 0,
      freeze: {
        operation_key: 'op',
        decision: 'whole',
        state_hash: 'hash',
        lease_exp: Date.now() + 30000,
      },
      appliedOperation: null,
    });
    assert.equal((await f.read()).status, 423);
  } finally {
    globalThis.fetch = original;
  }
});

// Test-only keys are generated for each test and never written to disk.
import {
  type EraseCommand,
  sha256,
  verifyEraseCommand,
} from '../../../packages/realtime/src/documents/erase';
import { applyDocumentErase, documentHashes } from './channel-document-erase';

function command(): EraseCommand {
  return {
    aud: 'tuturuuu.document-erase',
    kind: 'document-erase-apply',
    topic,
    document_id: documentId,
    operation_key: crypto.randomUUID(),
    doc_generation: 1,
    exp: Math.floor(Date.now() / 1000) + 30,
    nonce: crypto.randomUUID(),
    key_version: 1,
    decision: 'whole',
    expected_state_hash: '0'.repeat(64),
    lease_exp: Date.now() + 20000,
    blocks: [],
    expected_post_pm_hash: null,
  };
}
test('Ed25519 commands bind kind, topic, document, nonce, version, expiry and clock', async () => {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
  const ring = JSON.stringify({
    '1': b64(
      new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
    ),
  });
  const c = command();
  const body = b64(new TextEncoder().encode(JSON.stringify(c)));
  const signature = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        'Ed25519',
        keys.privateKey,
        new TextEncoder().encode(body)
      )
    )
  );
  const raw = `${body}.${signature}`;
  assert.deepEqual(await verifyEraseCommand(raw, ring), c);
  for (const mutation of [
    { kind: 'document-erase-release' },
    { topic: `meeting-document-${ownerId}` },
    { document_id: ownerId },
    { nonce: crypto.randomUUID() },
    { key_version: 2 },
    { exp: c.exp + 10 },
  ]) {
    const altered = b64(
      new TextEncoder().encode(JSON.stringify({ ...c, ...mutation }))
    );
    assert.equal(
      await verifyEraseCommand(`${altered}.${signature}`, ring),
      null
    );
  }
  assert.equal(await verifyEraseCommand(raw, ring, c.exp * 1000 + 1000), null);
  assert.equal(await verifyEraseCommand(raw, ring, Date.now() - 60000), null);
  assert.equal(await verifyEraseCommand(raw, '{}'), null);
});
for (const kind of ['marks', 'embeds', 'attributes']) {
  test(`real Yjs GC removes ${kind} and stale full-state push cannot restore deleted items`, async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);
    text.insert(
      0,
      'ERASE_CANARY',
      kind === 'marks' ? { bold: true } : undefined
    );
    if (kind === 'attributes')
      paragraph.setAttribute('title', 'ERASE_ATTRIBUTE_CANARY');
    if (kind === 'embeds')
      text.insertEmbed(text.length, { image: 'ERASE_EMBED_CANARY' });
    const stale = Y.encodeStateAsUpdate(doc);
    const result = await applyDocumentErase(doc, command());
    const bytes = Y.encodeStateAsUpdate(result.doc);
    assert.equal(Buffer.from(bytes).includes(Buffer.from('ERASE_')), false);
    Y.applyUpdate(result.doc, stale);
    assert.equal(result.doc.getXmlFragment('prosemirror').length, 0);
    assert.equal(
      Buffer.from(Y.encodeStateAsUpdate(result.doc)).includes(
        Buffer.from('ERASE_')
      ),
      false
    );
    result.doc.destroy();
    doc.destroy();
  });
}
test('block hashes refuse stale plans; recovery receipt mismatch refuses install', async () => {
  const doc = new Y.Doc();
  doc.getXmlFragment('prosemirror').insert(0, [new Y.XmlElement('paragraph')]);
  await assert.rejects(() =>
    applyDocumentErase(doc, {
      ...command(),
      decision: 'blocks',
      blocks: [{ index: 0, block_sha256: '0'.repeat(64) }],
    })
  );
  await assert.rejects(() =>
    applyDocumentErase(doc, {
      ...command(),
      expected_post_pm_hash: awaitableHash,
    })
  );
  const result = await applyDocumentErase(doc, command());
  assert.equal(
    result.hashes.post_pm_hash,
    (await documentHashes(result.doc)).post_pm_hash
  );
  assert.equal(
    result.hashes.post_state_hash,
    await sha256(Y.encodeStateAsUpdate(result.doc))
  );
  result.doc.destroy();
  doc.destroy();
});
const awaitableHash = 'f'.repeat(64);

test('whole erase removes every root in checkpoint bytes and keeps deleted item ids', async () => {
  const doc = new Y.Doc();
  doc.getMap('sidecar').set('private', 'ERASE_MAP');
  doc.getText('notes').insert(0, 'ERASE_TEXT');
  doc.getArray('items').push(['ERASE_ARRAY']);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('ERASE_XML')]);
  doc.getXmlFragment('other').insert(0, [paragraph]);
  const stale = Y.encodeStateAsUpdate(doc);
  const result = await applyDocumentErase(doc, command());
  Y.applyUpdate(result.doc, stale);
  const checkpoint = Y.encodeStateAsUpdate(result.doc);
  assert.equal(Buffer.from(checkpoint).includes(Buffer.from('ERASE_')), false);
  assert.equal(result.doc.getMap('sidecar').size, 0);
  assert.equal(result.doc.getText('notes').length, 0);
  assert.equal(result.doc.getArray('items').length, 0);
  result.doc.destroy();
  doc.destroy();
});
test('gate callbacks carry service UA and immutable claims with separate command nonce', async () => {
  const { ChannelDocumentErase } = await import(
    './channel-document-erase-protocol'
  );
  const f = fixture();
  const room = f.room();
  room.metadata = { topic, documentId, ownerId, checkpointAt: 0, version: 0 };
  const original = globalThis.fetch;
  let claims: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    assert.ok(
      new Headers(init?.headers)
        .get('User-Agent')
        ?.startsWith('Tuturuuu-Realtime/')
    );
    claims = JSON.parse(String(init?.body));
    return Response.json({});
  };
  try {
    await new ChannelDocumentErase(room).platformEraseCall('admit', {
      nonce: 'override',
      aud: 'override',
      command_nonce: 'ticket',
    });
    assert.notEqual(claims.nonce, 'override');
    assert.equal(claims.aud, 'tuturuuu.document-erase-callback');
    assert.equal(claims.command_nonce, 'ticket');
  } finally {
    globalThis.fetch = original;
  }
});
test('default-off protocol serves legacy documents without callbacks', async () => {
  const f = fixture();
  const room = f.room();
  delete room.env.MEET_ERASE_DO_PROTOCOL;
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 503 });
  };
  try {
    assert.equal((await f.read(room)).status, 200);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('warm reads and socket frames use cached gate', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      doc_generation: 0,
      doc_hold: false,
      restore_hold: false,
      document_store_states: {},
    });
  };
  try {
    const f = fixture();
    const room = f.room();
    assert.equal((await f.read(room)).status, 200);
    assert.equal((await f.read(room)).status, 200);
    const socket = {
      close() {},
      deserializeAttachment: () => ({ ticket: { exp: 1, docGeneration: 0 } }),
    };
    for (let i = 0; i < 10; i++)
      await room.webSocketMessage(socket as unknown as WebSocket, '{}');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('callback transport refuses HTTP and shared secrets and rotates by environment', async () => {
  const { ChannelDocumentErase } = await import(
    './channel-document-erase-protocol'
  );
  const room = fixture().room();
  await room.fetch(new Request('https://fixture.invalid'));
  room.metadata = { topic, documentId, ownerId, checkpointAt: 0, version: 0 };
  const protocol = new ChannelDocumentErase(room);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).key_version, 7);
    return Response.json({});
  };
  try {
    room.env.PLATFORM_API_BASE_URL = 'http://localhost';
    await assert.rejects(() => protocol.platformEraseCall('generation'));
    room.env.PLATFORM_API_BASE_URL = 'https://fixture.invalid';
    room.env.MEET_ERASE_CALLBACK_KEY_V1 = room.env.MEET_REALTIME_TOKEN_SECRET;
    await assert.rejects(() => protocol.platformEraseCall('generation'));
    room.env.MEET_ERASE_CALLBACK_KEY_V1 = 'rotated-fixture-only';
    room.env.MEET_ERASE_CALLBACK_KEY_VERSION = '7';
    await protocol.platformEraseCall('generation');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('updates to non-prosemirror roots are rejected before persistence', async () => {
  const f = fixture();
  const room = f.room();
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      doc_generation: 0,
      doc_hold: false,
      restore_hold: false,
      document_store_states: {},
    });
  try {
    await f.read(room);
    const doc = new Y.Doc();
    doc.getMap('sidecar').set('secret', 'ERASE_REJECTED');
    let reason = '';
    const socket = {
      close(_code: number, value: string) {
        reason = value;
      },
      deserializeAttachment: () => ({
        ticket: {
          topic,
          kind: 'join',
          role: 'editor',
          exp: Math.floor(Date.now() / 1000) + 30,
          docGeneration: 0,
        },
        windowAt: Date.now(),
        count: 0,
      }),
      serializeAttachment() {},
    };
    await room.webSocketMessage(
      socket as unknown as WebSocket,
      JSON.stringify({
        type: 'broadcast',
        event: 'message',
        payload: Array.from(Y.encodeStateAsUpdate(doc)),
      })
    );
    assert.equal(reason, 'Invalid document root');
    assert.equal(room.doc.share.has('sidecar'), false);
    doc.destroy();
  } finally {
    globalThis.fetch = original;
  }
});

test('idle document gate does not schedule recurring paid work', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      doc_generation: 0,
      doc_hold: false,
      restore_hold: false,
      document_store_states: {},
    });
  try {
    const f = fixture();
    const room = f.room();
    await f.read(room);
    await room.alarm();
    assert.equal(f.alarms.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
