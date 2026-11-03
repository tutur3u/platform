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
    bindings: { MEET_ERASE_LEDGER_KEY_V1: '07'.repeat(32) },
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
