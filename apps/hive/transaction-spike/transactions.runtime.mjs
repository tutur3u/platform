import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  demonstrateUnsafeReadDecideWrite,
  initializeD1,
  resetD1,
  snapshotD1,
  transferD1,
} from './d1-fixture.mjs';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(wranglerRequire.resolve('miniflare')).href
);
const supplier = {
  wrangler: require('wrangler/package.json').version,
  miniflare: wranglerRequire('miniflare/package.json').version,
};

const directory = await mkdtemp(join(tmpdir(), 'hive-transaction-spike-'));
let deniedEgress = 0;
const options = convertV4MiniflareOptions({
  modules: true,
  scriptPath: fileURLToPath(new URL('./worker.mjs', import.meta.url)),
  compatibilityDate: '2026-10-26',
  cf: false,
  host: '127.0.0.1',
  port: 0,
  durableObjects: {
    LEDGER: { className: 'HiveTransactionSpike', useSQLite: true },
  },
  resourcePersistencePath: join(directory, 'storage'),
  resourceTmpPath: join(directory, 'runtime'),
  unsafeDevRegistryPath: join(directory, 'registry'),
  d1Databases: { DB: 'disposable-hive-spike' },
  outboundService() {
    deniedEgress++;
    return new Response('Egress forbidden', { status: 599 });
  },
});
for (const worker of options.workers) worker.dev.unsafeRegisterWorker = false;
let runtime;
const evidence = [];

async function callDO(input) {
  const response = await runtime.dispatchFetch('https://hive-spike.invalid/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() };
}

function checkCommittedState(state) {
  assert.equal(
    state.wallets.reduce((sum, row) => sum + row.balance, 0),
    1000
  );
  assert.equal(state.wallets.find((row) => row.id === 'seller').balance, 300);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.operations.length, 1);
}

try {
  runtime = new Miniflare(options);
  assert.deepEqual((await callDO({ action: 'egress-check' })).body, {
    blocked: 599,
  });
  assert.equal(deniedEgress, 1);
  const db = await runtime.getD1Database('DB');
  await initializeD1(db);
  await resetD1(db);
  const unsafe = await demonstrateUnsafeReadDecideWrite(db);
  assert.equal(
    unsafe.wallets.reduce((sum, row) => sum + row.balance, 0),
    1700
  );
  assert.equal(unsafe.ledger.length, 2);
  evidence.push({
    check: 'D1 read/decide/write negative control',
    result: 'double-spend reproduced',
    total: 1700,
  });

  await resetD1(db);
  const inputs = [
    { id: 'spend-a', to: 'buyer-a', amount: 700 },
    { id: 'spend-b', to: 'buyer-b', amount: 700 },
  ];
  const d1Results = await Promise.allSettled(
    inputs.map((input) => transferD1(db, input))
  );
  assert.equal(d1Results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = d1Results.find((r) => r.status === 'rejected');
  assert.match(String(rejected.reason), /insufficient-funds/);
  const d1BeforeReplay = await snapshotD1(db);
  checkCommittedState(d1BeforeReplay);
  const winner = inputs[d1Results.findIndex((r) => r.status === 'fulfilled')];
  await transferD1(db, winner);
  assert.deepEqual(await snapshotD1(db), d1BeforeReplay);
  await assert.rejects(
    transferD1(db, { ...winner, amount: 1 }),
    /operation-conflict/
  );
  await resetD1(db);
  const d1Clean = await snapshotD1(db);
  await assert.rejects(
    transferD1(db, { id: 'rollback', to: 'missing', amount: 700 }),
    /missing-wallet/
  );
  assert.deepEqual(await snapshotD1(db), d1Clean);
  await resetD1(db);
  await transferD1(db, winner);
  evidence.push({
    check: 'D1 conditional batch with aborting SQL trigger',
    result: 'one spend; replay/conflict/rollback verified',
  });

  await callDO({ action: 'reset' });
  const doResults = await Promise.all(
    inputs.map((input) => callDO({ action: 'transfer', ...input }))
  );
  assert.equal(doResults.filter((r) => r.status === 200).length, 1);
  assert.equal(
    doResults.filter(
      (r) => r.status === 409 && r.body.error.includes('insufficient-funds')
    ).length,
    1
  );
  const doBeforeReplay = (await callDO({ action: 'snapshot' })).body;
  checkCommittedState(doBeforeReplay);
  const doWinner = inputs[doResults.findIndex((r) => r.status === 200)];
  assert.equal(
    (await callDO({ action: 'transfer', ...doWinner })).body.replayed,
    true
  );
  assert.deepEqual((await callDO({ action: 'snapshot' })).body, doBeforeReplay);
  assert.match(
    (await callDO({ action: 'transfer', ...doWinner, amount: 1 })).body.error,
    /operation-conflict/
  );
  await callDO({ action: 'reset' });
  const doClean = (await callDO({ action: 'snapshot' })).body;
  assert.equal(
    (
      await callDO({
        action: 'transfer',
        id: 'rollback',
        to: 'missing',
        amount: 700,
      })
    ).status,
    409
  );
  assert.deepEqual((await callDO({ action: 'snapshot' })).body, doClean);
  await callDO({ action: 'reset' });
  await callDO({ action: 'transfer', ...doWinner });
  evidence.push({
    check: 'DO SQLite transactionSync',
    result: 'one spend; replay/conflict/rollback verified',
  });

  await runtime.dispose();
  runtime = new Miniflare(options);
  const restoredD1 = await runtime.getD1Database('DB');
  checkCommittedState(await snapshotD1(restoredD1));
  await transferD1(restoredD1, winner);
  checkCommittedState(await snapshotD1(restoredD1));
  assert.equal(
    (await callDO({ action: 'transfer', ...doWinner })).body.replayed,
    true
  );
  checkCommittedState((await callDO({ action: 'snapshot' })).body);
  assert.equal(deniedEgress, 1);
  evidence.push({
    check: 'runtime restart',
    result:
      'D1 and DO durable receipts survive; only the deliberate egress probe was intercepted',
  });
  console.log(JSON.stringify({ localOnly: true, supplier, evidence }, null, 2));
} finally {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
}
