import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';
import {
  admitEnvironment,
  assertDockerApiVersion,
  assertDrained,
  assertFixturePolicy,
  assertFixtureTap,
  assertLedger,
  assertNetworkInventory,
  assertOwnedNetwork,
  assertProjectContainers,
  assertSnapshot,
  boundedExecutor,
  executeFixture,
  snapshotSql,
  sourceSha,
} from './verify-mail-inbound-full-schema.mjs';

const tap = (count = 40) =>
  [
    `1..${count}`,
    ...Array.from(
      { length: count },
      (_, i) => `ok ${i + 1} - synthetic assertion ${i + 1}`
    ),
  ].join('\n');
const ledger = Array.from({ length: 1382 }, (_, i) =>
  String(20200000000000 + i)
);
const fixtureHash = 'a'.repeat(64);
const networkId = 'b'.repeat(64);
const project = 'owned-mail-project';
const network = () => ({
  Name: `mail-qualification-${project}`,
  Internal: true,
  Driver: 'bridge',
  EnableIPv6: false,
  Labels: {
    'tuturuuu.mail.source': sourceSha,
    'tuturuuu.mail.fixture': fixtureHash,
    'tuturuuu.mail.project': project,
  },
  Containers: {},
});

test('Docker daemon must reject duplicate network names before any replay', () => {
  for (const version of ['1.44', '1.45', '1.52'])
    assertDockerApiVersion(version);
  for (const version of ['1.43', '1.24', '2.0', 'unavailable'])
    assert.throws(() => assertDockerApiVersion(version));
});

test('only the root-owned immutable network may exist through container drain', () => {
  assertNetworkInventory([], [networkId], networkId);
  for (const [cliIds, rootIds] of [
    [['cli-created-id'], [networkId]],
    [[], []],
    [[], [networkId, 'foreign']],
    [[], ['foreign']],
  ])
    assert.throws(() => assertNetworkInventory(cliIds, rootIds, networkId));
});
const container = () => ({
  Id: 'database-id',
  Name: `/supabase_db_${project}`,
  Config: { Labels: { 'com.supabase.cli.project': project } },
  HostConfig: { Privileged: false, CapAdd: [], NetworkMode: networkId },
  NetworkSettings: { Networks: { owned: { NetworkID: networkId } } },
});
const snapshot = () => ({
  owned: 0,
  counts: Array(21).fill(0),
  triggers: [
    {
      rel: 'private.notification_batches',
      name: 'trigger_send_immediate_notification',
      state: 'O',
      function: 'public.trigger_immediate_notification_send',
      body: 'frozen-body',
      definition: 'frozen-trigger',
    },
  ],
});
const fixtureSql = readFileSync(
  new URL('../supabase/tests/mail-inbound-full-schema.sql', import.meta.url),
  'utf8'
);

test('strict TAP rejects short, duplicate, skipped, failed and unrelated plans', () => {
  assertFixtureTap(tap());
  for (const value of [
    tap(39),
    tap(41),
    tap().replace('ok 40', 'not ok 40'),
    tap().replace('ok 40', 'ok 39'),
    `${tap()}\n1..40`,
    `${tap()}\nBail out! stopped`,
    tap().replace('assertion 40', 'assertion 40 # SKIP'),
    tap().split('\n').slice(0, -1).join('\n'),
  ])
    assert.throws(() => assertFixtureTap(value));
});

test('exact full ledger rejects missing, extra, reordered and duplicate versions', () => {
  assertLedger(ledger, [...ledger]);
  for (const value of [
    ledger.slice(1),
    [...ledger, 'extra'],
    [...ledger].reverse(),
    [...ledger.slice(0, -1), ledger[0]],
  ])
    assert.throws(() => assertLedger(ledger, value));
});

test('runtime admission requires hosted exact source/fixture/network and no provider credentials', () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    MAIL_FULL_SCHEMA_ADMISSION: `${sourceSha}:${fixtureHash}`,
    MAIL_FULL_SCHEMA_SOURCE_ROOT: '/frozen',
    MAIL_FULL_SCHEMA_NETWORK_ID: networkId,
    RUNNER_TEMP: '/runner',
  };
  admitEnvironment(env, fixtureHash);
  for (const key of Object.keys(env))
    assert.throws(() => admitEnvironment({ ...env, [key]: '' }, fixtureHash));
  for (const key of [
    'SUPABASE_ACCESS_TOKEN',
    'DATABASE_URL',
    'SUPABASE_CLI_BINARY_OVERRIDE',
    'AWS_ACCESS_KEY_ID',
    'CLOUDFLARE_API_TOKEN',
    'S3_SECRET_KEY',
    'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET',
  ])
    assert.throws(
      () =>
        admitEnvironment(
          { ...env, [key]: 'synthetic-secret-do-not-echo' },
          fixtureHash
        ),
      (e) => !e.message.includes('synthetic-secret')
    );
  assert.throws(() =>
    admitEnvironment(
      { ...env, MAIL_FULL_SCHEMA_ADMISSION: `${sourceSha}:foreign` },
      fixtureHash
    )
  );
  assert.throws(() =>
    admitEnvironment(
      { ...env, DOCKER_HOST: 'tcp://foreign.invalid:2375' },
      fixtureHash
    )
  );
  assert.throws(() =>
    admitEnvironment({ ...env, DOCKER_CONTEXT: 'production' }, fixtureHash)
  );
});

test('network cannot be shared, external, IPv6, or carry another source/fixture/project', () => {
  assertOwnedNetwork(network(), fixtureHash, project, true);
  for (const override of [
    { Internal: false },
    { Name: 'unverified-network-name' },
    { Driver: 'host' },
    { EnableIPv6: true },
    { Labels: {} },
    { Containers: { foreign: {} } },
  ])
    assert.throws(() =>
      assertOwnedNetwork(
        { ...network(), ...override },
        fixtureHash,
        project,
        true
      )
    );
  assert.throws(() => assertOwnedNetwork(network(), 'foreign', project));
  assert.throws(() =>
    assertOwnedNetwork(
      {
        ...network(),
        Labels: { ...network().Labels, 'com.supabase.cli.project': project },
      },
      fixtureHash,
      project
    )
  );
  assert.throws(() => assertOwnedNetwork(network(), fixtureHash, 'foreign'));
});

test('all project containers including transients must use only the admitted network', () => {
  assertProjectContainers([container()], networkId, project);
  const transient = {
    ...container(),
    Id: 'transient',
    Name: `/supabase_meta_${project}`,
  };
  assertProjectContainers([container(), transient], networkId, project);
  for (const c of [
    {
      ...container(),
      Config: { Labels: { 'com.supabase.cli.project': 'foreign' } },
    },
    { ...container(), HostConfig: { Privileged: true } },
    { ...container(), HostConfig: { CapAdd: ['NET_ADMIN'] } },
    {
      ...container(),
      NetworkSettings: {
        Networks: {
          owned: { NetworkID: networkId },
          external: { NetworkID: 'external' },
        },
      },
    },
    {
      ...container(),
      NetworkSettings: { Networks: { owned: { NetworkID: 'wrong' } } },
    },
  ])
    assert.throws(() =>
      assertProjectContainers([container(), c], networkId, project)
    );
  assert.throws(() => assertProjectContainers([], networkId, project));
});

test('drain fails on stopped/transient project containers or any remaining network attachment', () => {
  assertDrained([], [], network(), project);
  assert.throws(() => assertDrained(['transient-id'], [], network(), project));
  assert.throws(() =>
    assertDrained([], [`supabase_meta_${project}`], network(), project)
  );
  assert.throws(() =>
    assertDrained(
      [],
      [],
      { ...network(), Containers: { foreign: {} } },
      project
    )
  );
});

test('catalog guards reject collision and transport function/state drift', () => {
  assertSnapshot(snapshot(), 'frozen-body');
  for (const s of [
    { ...snapshot(), owned: 1 },
    { ...snapshot(), counts: [] },
    { ...snapshot(), triggers: [] },
    { ...snapshot(), triggers: [{ ...snapshot().triggers[0], state: 'D' }] },
    {
      ...snapshot(),
      triggers: [{ ...snapshot().triggers[0], body: 'changed' }],
    },
  ])
    assert.throws(() => assertSnapshot(s, 'frozen-body'));
});

test('bounded argv execution never includes raw failure output or secret values', () => {
  const calls = [];
  const exec = boundedExecutor(
    (...args) => {
      calls.push(args);
      return '  synthetic stdout\n';
    },
    { PATH: '/fixture/bin', SUPABASE_NO_UPDATE_NOTIFIER: '1' },
    '/control'
  );
  assert.equal(
    exec(
      'docker',
      ['exec', 'owned', 'psql', '-X', '-v', 'ON_ERROR_STOP=1'],
      '/source',
      120000
    ),
    'synthetic stdout'
  );
  assert.deepEqual(calls[0].slice(0, 2), [
    'docker',
    ['exec', 'owned', 'psql', '-X', '-v', 'ON_ERROR_STOP=1'],
  ]);
  assert.equal(calls[0][2].timeout, 120000);
  assert.equal(calls[0][2].maxBuffer, 16 * 1024 * 1024);
  assert.deepEqual(calls[0][2].stdio, ['ignore', 'pipe', 'pipe']);
  const fail = boundedExecutor(
    () => {
      throw new Error('provider-secret synthetic raw SQL');
    },
    {},
    '/fixture'
  );
  assert.throws(
    () => fail('fixture', []),
    (e) => e.message === 'Qualification subprocess failed; raw output withheld'
  );
});

test('fixture safety control rejects a real broadened delete, commit, or pg_net replacement', () => {
  assertFixturePolicy(fixtureSql);
  for (const value of [
    fixtureSql.replace('rollback;', 'commit;'),
    fixtureSql.replace(
      'delete from private.mail_mailbox_members where id=pg_temp.fixture_id(30);',
      'delete from private.mail_mailbox_members;'
    ),
    fixtureSql +
      '\ncreate function net.http_post() returns bigint language sql as $$select 1$$;',
    fixtureSql.replace(
      'select plan(40);',
      "select plan(40);\nselect ok(true,'unexpected');"
    ),
  ])
    assert.throws(() => assertFixturePolicy(value));
});

function boundary(options = {}) {
  const calls = [];
  let read = 0;
  const input = {
    expectedLedger: ledger,
    transportHash: 'frozen-body',
    inspect: async () => {
      calls.push('inspect');
    },
    sql: async (statement) => {
      calls.push(statement === snapshotSql ? 'snapshot' : 'ledger');
      if (statement !== snapshotSql)
        return JSON.stringify(options.ledger ?? ledger);
      read++;
      return JSON.stringify(
        read === 1
          ? (options.before ?? snapshot())
          : (options.after ?? snapshot())
      );
    },
    audit: async () => {
      calls.push('fixture');
      if (options.throw) throw new Error('raw SQL should be redacted');
      return options.tap ?? tap();
    },
    writeAudit: (r) =>
      calls.push(r.restored ? 'proof-restored' : 'proof-before'),
  };
  return { calls, input };
}

test('real boundary ordering proves ledger/catalog before fixture and fresh rollback probe afterwards', async () => {
  const { calls, input } = boundary();
  const result = await executeFixture(input);
  assert.deepEqual(calls, [
    'inspect',
    'ledger',
    'snapshot',
    'proof-before',
    'fixture',
    'inspect',
    'snapshot',
    'proof-restored',
  ]);
  assert.deepEqual(result, {
    schema: true,
    assertions: 40,
    rollback: true,
    types: false,
    consumer: false,
    provider: false,
    device: false,
  });
});

test('bad ledger or namespace collision prevents fixture execution', async () => {
  for (const options of [
    { ledger: ledger.slice(1) },
    { before: { ...snapshot(), owned: 1 } },
  ]) {
    const { calls, input } = boundary(options);
    await assert.rejects(executeFixture(input));
    assert.equal(calls.includes('fixture'), false);
  }
});

for (const failure of [
  { throw: true },
  { tap: tap(39) },
  { after: { ...snapshot(), owned: 1 } },
  { after: { ...snapshot(), counts: [1, ...Array(20).fill(0)] } },
]) {
  test(`fixture failure still probes rollback and fails closed ${JSON.stringify(failure).slice(0, 55)}`, async () => {
    const { calls, input } = boundary(failure);
    await assert.rejects(executeFixture(input));
    assert.equal(calls.filter((c) => c === 'snapshot').length, 2);
    assert.equal(calls.includes('proof-restored'), false);
  });
}

for (const fail of ['fixture', 'stop']) {
  test(`existing isolated lifecycle retains cleanup and excludes typegen on ${fail} failure`, async () => {
    const calls = [];
    const code = await runIsolatedLifecycle({
      binaryPath: 'injected-not-executed',
      metadata: {
        disposableRoot: '/fixture',
        projectId: project,
        testPath: 'supabase/tests/mail-inbound-full-schema.sql',
        typegenOutput: null,
      },
      registerSignals: () => () => {},
      updateMetadata: async () => {},
      removeRoot: async () => calls.push('remove'),
      stderr: { write: () => {} },
      typegen: async () => {
        throw new Error('typegen forbidden');
      },
      runner: async (_binary, args) => {
        calls.push(args);
        if (args.includes('test') && fail === 'fixture')
          throw new Error('SQL failed');
        return { code: args.includes('stop') && fail === 'stop' ? 7 : 0 };
      },
    });
    assert.notEqual(code, 0);
    const stop = calls.find((c) => Array.isArray(c) && c.includes('stop'));
    assert.deepEqual(stop, [
      '--workdir',
      '/fixture',
      'stop',
      '--project-id',
      project,
      '--no-backup',
    ]);
    assert.equal(calls.includes('remove'), fail !== 'stop');
  });
}
