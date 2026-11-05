import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const topic = 'meeting-document-11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';
const encode = (v) => Buffer.from(v).toString('base64url');
test('SQLite restart freeze/apply/release, replay, hold lease and wiped storage', async () => {
  const bundle = await build({
    entryPoints: [
      new URL('../test-fixtures/document-erase/worker.ts', import.meta.url)
        .pathname,
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers', 'node:*'],
    alias: {
      '@tuturuuu/realtime/collaboration/server': new URL(
        '../../../packages/realtime/src/collaboration/server.ts',
        import.meta.url
      ).pathname,
    },
  });
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  let sourceState;
  const callbackNonces = new Set();
  let admits = 0;
  let status = 'unknown';
  let committed = false;
  let generation = 0,
    hold = false,
    history = 'held',
    allowed = true;
  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-06-20',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { ROOM: { className: 'EraseFixture', useSQLite: true } },
    bindings: {
      MEET_REALTIME_TOKEN_SECRET: 'fixture-only',
      MEET_ERASE_CALLBACK_KEY_V1: 'fixture-callback-only',
      MEET_ERASE_DO_PROTOCOL: 'true',
      MEET_ERASE_DO_PUBLIC_KEYS: JSON.stringify({
        1: encode(await crypto.subtle.exportKey('raw', keys.publicKey)),
      }),
      PLATFORM_API_BASE_URL: 'https://platform.invalid',
    },
    outboundService: async (request) => {
      assert.ok(request.headers.get('Authorization')?.startsWith('Bearer '));
      assert.ok(
        request.headers.get('User-Agent')?.startsWith('Tuturuuu-Realtime/')
      );
      const body = await request.json();
      assert.equal(callbackNonces.has(body.nonce), false);
      callbackNonces.add(body.nonce);
      if (body.kind === 'status')
        return Response.json({ state: status, committed });
      if (body.kind === 'admit') {
        admits++;
        assert.notEqual(body.nonce, body.command_nonce);
        return Response.json({
          source_state: sourceState,
          allowed,
          nonce: body.command_nonce,
          operation_key: body.operation_key,
          doc_generation: body.doc_generation,
          expires_at: body.lease_exp,
        });
      }
      return Response.json({
        doc_generation: generation,
        doc_hold: hold,
        restore_hold: false,
        active_operation_key: crypto.randomUUID(),
        document_store_states: {
          'S-DL': hold ? 'pending' : 'confirmed',
          'S-DS': hold ? 'pending' : 'confirmed',
          'S-DH': history,
          'S-X:cache': 'held',
        },
      });
    },
  });
  const dispatch = (path, headers = {}) =>
    mf.dispatchFetch(`https://fixture.invalid${path}`, { headers });
  const ticket = () => ({
    'x-channel-ticket': JSON.stringify({
      kind: 'document',
      topic,
      documentId,
      ownerId,
      exp: Math.floor(Date.now() / 1000) + 30,
      docGeneration: generation,
    }),
  });
  const command = {
    aud: 'tuturuuu.document-erase',
    kind: 'document-erase-state',
    topic,
    document_id: documentId,
    owner_id: ownerId,
    operation_key: crypto.randomUUID(),
    doc_generation: 1,
    exp: Math.floor(Date.now() / 1000) + 30,
    nonce: crypto.randomUUID(),
    key_version: 1,
    decision: 'whole',
    expected_state_hash: '0'.repeat(64),
    lease_exp: Date.now() + 25000,
    blocks: [],
    expected_post_pm_hash: null,
  };
  async function send(c) {
    const body = encode(JSON.stringify(c));
    const signature = encode(
      await crypto.subtle.sign(
        'Ed25519',
        keys.privateKey,
        new TextEncoder().encode(body)
      )
    );
    return mf.dispatchFetch('https://fixture.invalid/channels/erase', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body}.${signature}` },
    });
  }
  try {
    await dispatch('/seed');
    assert.equal((await dispatch('/channels/document', ticket())).status, 200);
    const snapshot = await (await send(command)).json();
    sourceState = snapshot.state;
    command.expected_state_hash = snapshot.post_state_hash;
    for (const outcome of ['not_committed', 'in_progress']) {
      const leave = {
        ...command,
        kind: 'document-erase-freeze',
        decision: 'leave',
        doc_generation: 0,
        nonce: crypto.randomUUID(),
        operation_key: crypto.randomUUID(),
      };
      assert.equal((await send(leave)).status, 200);
      assert.equal(
        (await dispatch('/channels/document', ticket())).status,
        423
      );
      await dispatch('/expire');
      status = outcome;
      committed = outcome === 'in_progress';
      await dispatch('/alarm');
      assert.equal(
        (await dispatch('/channels/document', ticket())).status,
        200
      );
    }
    let response = await send({
      ...command,
      kind: 'document-erase-freeze',
      nonce: crypto.randomUUID(),
    });
    assert.equal(response.status, 200);
    assert.equal((await dispatch('/channels/document', ticket())).status, 423);
    generation = 1;
    hold = true;
    const apply = {
      ...command,
      kind: 'document-erase-apply',
      nonce: crypto.randomUUID(),
    };
    allowed = false;
    assert.equal((await send(apply)).status, 423);
    allowed = true;
    response = await send(apply);
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.deepEqual(await (await send(apply)).json(), receipt);
    assert.equal((await dispatch('/channels/document', ticket())).status, 423);
    assert.equal(
      (
        await send({
          ...command,
          kind: 'document-erase-release',
          nonce: crypto.randomUUID(),
        })
      ).status,
      423
    );
    hold = false;
    assert.equal((await dispatch('/channels/document', ticket())).status, 423);
    assert.equal(
      (
        await send({
          ...command,
          kind: 'document-erase-release',
          nonce: crypto.randomUUID(),
        })
      ).status,
      200
    );
    assert.equal((await dispatch('/channels/document', ticket())).status, 200);
    const persisted = await (await dispatch('/inspect')).json();
    for (const [key, value] of Object.entries(persisted))
      if (key.startsWith('erase-nonce:')) {
        assert.equal('raw' in value, false);
        assert.equal(
          'state' in value.result && Array.isArray(value.result.state),
          false
        );
      }
    assert.equal(persisted.erase.installedGeneration, 1);
    assert.equal(persisted.erase.freeze, null);
    assert.equal((await dispatch('/channels/document', ticket())).status, 200); // history and S-X still held
    await dispatch('/wipe');
    hold = true;
    const replay = {
      ...apply,
      nonce: crypto.randomUUID(),
      expected_post_pm_hash: receipt.post_pm_hash,
    };
    const beforeRecovery = admits;
    assert.equal((await send(replay)).status, 200);
    assert.equal(admits - beforeRecovery, 1);
    assert.equal((await dispatch('/channels/document', ticket())).status, 423);
  } finally {
    await mf.dispose();
  }
});
