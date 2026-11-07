import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('real Worker RPC serializes concurrent SQLite/R2 appends and survives restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'erase-v9-runtime-'));
  const bundle = await build({
    entryPoints: [new URL('./erase-ledger-do.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
    external: ['cloudflare:workers'],
  });
  const options = {
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-06',
    durableObjects: {
      MEET_ERASE_LEDGER: { className: 'MeetEraseLedger', useSQLite: true },
    },
    r2Buckets: ['LEDGER_BUCKET'],
    bindings: {
      MEET_ERASE_LEDGER_KEY_V1: '07'.repeat(32),
      MEET_AI_PROTECTED_WORKSPACE_IDS: '99999999-9999-4999-8999-999999999999',
    },
    durableObjectsPersist: join(dir, 'do'),
    r2Persist: join(dir, 'r2'),
  };
  let mf = new Miniflare(options);
  try {
    assert.equal((await mf.dispatchFetch('http://local/')).status, 404);
    const ns = await mf.getDurableObjectNamespace('MEET_ERASE_LEDGER');
    const stub = ns.get(ns.idFromName('meet-erase-ledger/v1'));
    const inputs = Array.from({ length: 10 }, (_, n) => ({
      kind: 'hold_create',
      operation_key: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      ws_id: '11111111-1111-4111-8111-111111111111',
      meeting_id: null,
      body: {
        hold_id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
        transition_id: `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`,
        scope: {
          ws_id: '11111111-1111-4111-8111-111111111111',
          meeting_id: null,
        },
        kind: 'legal_hold',
        at: '2026-11-03T00:00:00.000Z',
        approval_ref: '44444444-4444-4444-8444-444444444444',
        review_by: '2026-12-03T00:00:00.000Z',
      },
    }));
    const entries = await Promise.all(inputs.map((i) => stub.append(i)));
    assert.deepEqual(
      entries.map((e) => e.seq).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    );
    assert.equal((await stub.read(0, 500)).head.seq, 10);
    const bucket = await mf.getR2Bucket('LEDGER_BUCKET');
    assert.equal((await bucket.list()).objects.length, 10);
    const firstSeq = entries[0].seq;
    await mf.dispose();
    mf = new Miniflare(options);
    const ns2 = await mf.getDurableObjectNamespace('MEET_ERASE_LEDGER');
    const restarted = ns2.get(ns2.idFromName('meet-erase-ledger/v1'));
    assert.equal((await restarted.read(0, 500)).head.seq, 10);
    const duplicate = await restarted.append(inputs[0]);
    assert.equal(duplicate.seq, firstSeq);
  } finally {
    await mf.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test('service capabilities separate holds and fail closed on invalid keys/config', async () => {
  const bundle = await build({
    entryPoints: [new URL('./erase-ledger-do.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
    external: ['cloudflare:workers'],
  });
  const hold = {
    kind: 'hold_create',
    operation_key: '22222222-2222-4222-8222-222222222222',
    ws_id: '11111111-1111-4111-8111-111111111111',
    meeting_id: null,
    body: {
      hold_id: '22222222-2222-4222-8222-222222222222',
      transition_id: '33333333-3333-4333-8333-333333333333',
      scope: {
        ws_id: '11111111-1111-4111-8111-111111111111',
        meeting_id: null,
      },
      kind: 'legal_hold',
      at: '2026-11-03T00:00:00.000Z',
      approval_ref: '44444444-4444-4444-8444-444444444444',
      review_by: '2026-12-03T00:00:00.000Z',
    },
  };
  for (const [key, protectedIds, expected] of [
    ['07'.repeat(32), '99999999-9999-4999-8999-999999999999', 'ok'],
    ['', '99999999-9999-4999-8999-999999999999', 'LEDGER_KEY_UNAVAILABLE'],
    ['aa', '99999999-9999-4999-8999-999999999999', 'LEDGER_KEY_UNAVAILABLE'],
    [
      'AB'.repeat(32),
      '99999999-9999-4999-8999-999999999999',
      'LEDGER_KEY_UNAVAILABLE',
    ],
    ['07'.repeat(32), '', 'LEDGER_PROTECTED_CONFIG_INVALID'],
    ['07'.repeat(32), 42, 'LEDGER_UNAVAILABLE'],
  ]) {
    const mf = new Miniflare({
      workers: [
        {
          name: 'ledger',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-08-06',
          durableObjects: {
            MEET_ERASE_LEDGER: {
              className: 'MeetEraseLedger',
              useSQLite: true,
            },
          },
          r2Buckets: ['LEDGER_BUCKET'],
          bindings: {
            MEET_ERASE_LEDGER_KEY_V1: key,
            MEET_AI_PROTECTED_WORKSPACE_IDS: protectedIds,
          },
        },
        {
          name: 'caller',
          modules: true,
          compatibilityDate: '2026-08-06',
          serviceBindings: {
            ERASE: { name: 'ledger', entrypoint: 'EraseLedgerService' },
            HOLD: { name: 'ledger', entrypoint: 'HoldLedgerService' },
          },
          script: `export default {async fetch(request, env) {
          const {binding, value} = await request.json();
          try { await env[binding].append(value); return new Response('ok'); }
          catch (e) { return new Response(e.message); }
        }};`,
        },
      ],
    });
    try {
      const caller = await mf.getWorker('caller');
      const call = async (binding, value) =>
        (
          await caller.fetch('http://local', {
            method: 'POST',
            body: JSON.stringify({ binding, value }),
          })
        ).text();
      assert.match(
        await call('ERASE', hold),
        /LEDGER_HOLD_ENTRYPOINT_REQUIRED/
      );
      assert.match(
        await call('HOLD', { ...hold, kind: 'receipt' }),
        /LEDGER_HOLD_INPUT_REQUIRED/
      );
      assert.match(await call('HOLD', hold), new RegExp(expected));
      const bucket = await mf.getR2Bucket('LEDGER_BUCKET', 'ledger');
      assert.equal(
        (await bucket.list()).objects.length,
        expected === 'ok' ? 1 : 0
      );
    } finally {
      await mf.dispose();
    }
  }
});

test('hold service rejects concurrent creates for the same hold and normalizes errors', async () => {
  const bundle = await build({
    entryPoints: [new URL('./erase-ledger-do.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
    external: ['cloudflare:workers'],
  });
  const mf = new Miniflare({
    workers: [
      {
        name: 'client',
        modules: true,
        compatibilityDate: '2026-08-06',
        serviceBindings: {
          HOLDS: { name: 'ledger', entrypoint: 'HoldLedgerService' },
        },
        script: `export default {
          async fetch(request, env) {
            try {
              return Response.json(await env.HOLDS.append(await request.json()));
            } catch (error) {
              return Response.json({ error: error.message }, { status: 409 });
            }
          }
        }`,
      },
      {
        name: 'ledger',
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: '2026-08-06',
        durableObjects: {
          MEET_ERASE_LEDGER: { className: 'MeetEraseLedger', useSQLite: true },
        },
        r2Buckets: ['LEDGER_BUCKET'],
        bindings: {
          MEET_ERASE_LEDGER_KEY_V1: '07'.repeat(32),
          MEET_AI_PROTECTED_WORKSPACE_IDS:
            '99999999-9999-4999-8999-999999999999',
        },
      },
    ],
  });
  const ws = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  const input = {
    kind: 'hold_create',
    operation_key: id,
    ws_id: ws,
    meeting_id: null,
    body: {
      hold_id: id,
      transition_id: '33333333-3333-4333-8333-333333333333',
      scope: { ws_id: ws, meeting_id: null },
      kind: 'legal_hold',
      at: '2026-11-03T00:00:00.000Z',
      approval_ref: '44444444-4444-4444-8444-444444444444',
      review_by: '2026-12-03T00:00:00.000Z',
    },
  };
  const append = (value) =>
    mf.dispatchFetch('http://local/', {
      method: 'POST',
      body: JSON.stringify(value),
    });
  try {
    const responses = await Promise.all([
      append(input),
      append({ ...input, body: { ...input.body, transition_id: ws } }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const rejected = responses.find((r) => r.status === 409);
    assert.deepEqual(await rejected.json(), { error: 'LEDGER_HOLD_CONFLICT' });
    const ns = await mf.getDurableObjectNamespace(
      'MEET_ERASE_LEDGER',
      'ledger'
    );
    const stub = ns.get(ns.idFromName('meet-erase-ledger/v1'));
    const verified = await stub.verify();
    assert.equal(verified.head.seq, 1);
    assert.equal(verified.holds.length, 1);
    const bucket = await mf.getR2Bucket('LEDGER_BUCKET', 'ledger');
    assert.equal((await bucket.list()).objects.length, 1);

    const invalid = await append({
      ...input,
      body: { ...input.body, name: 'private' },
    });
    assert.deepEqual(await invalid.json(), { error: 'LEDGER_INPUT_INVALID' });
  } finally {
    await mf.dispose();
  }
});
