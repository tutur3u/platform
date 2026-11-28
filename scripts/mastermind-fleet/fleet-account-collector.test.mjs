// The fleet account view at the collector boundary: the real T3 reader, usage
// collector and publisher run over fixture sockets and fetches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fixtureDatabase, fakePeers, threadLister } from './fixture.mjs';
import { runOnce } from './publish.mjs';
import { readT3Usage } from './t3-usage.mjs';
import { usageCollector } from './usage-snapshot.mjs';

const NOW = new Date('2026-11-20T03:00:00.000Z');
const SHARED = {
  status: 'authenticated',
  email: 'shared.person@example.com',
  workspaceId: 'fixture-org-shared',
};
const OTHER = { ...SHARED, workspaceId: 'fixture-org-other' };
const FINGERPRINT = 'cd'.repeat(32);
const PRIVATE =
  /fixture-org|(?:cd){8}|acct-|unidentified-|fleetRows|accountKey/;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

function provider(
  instanceId,
  auth,
  usedPercent,
  ageMs,
  driver = 'claudeAgent'
) {
  return {
    instanceId,
    driver,
    displayName: instanceId,
    enabled: true,
    installed: true,
    auth,
    usageLimits: {
      checkedAt: ago(ageMs),
      credentialFingerprint: FINGERPRINT,
      windows: [
        {
          id: 'five_hour',
          kind: 'session',
          usedPercent,
          resetsAt: '2026-11-20T07:00:00.000Z',
        },
      ],
    },
  };
}

const CODEX = { ...SHARED, workspaceId: 'fixture-org-codex' };

/**
 * `claude_1` is a long-stale alias of `claudeAgent` on the first machine, and
 * the second machine's `claudeAgent` is a different account.
 */
const FLEET = {
  local: [
    provider('claude_1', SHARED, 99, 16 * 3_600_000),
    provider('claudeAgent', SHARED, 40, 200_000),
    provider('codex', CODEX, 12, 30_000, 'codex'),
  ],
  macstudio1: [
    provider('claude_x', SHARED, 55, 60_000),
    provider('claudeAgent', OTHER, 7, 60_000),
  ],
};

/** Fixture T3 environments that answer the real reader without a network. */
function t3World(fleet) {
  const environment = (origin) => new URL(origin).hostname.split('.')[0];
  const readers = {};
  const collect = (options) => {
    const id = environment(options.origin);
    return readT3Usage({
      ...options,
      async fetchImpl(url) {
        return String(url).endsWith('/environment')
          ? Response.json({ environmentId: options.environmentId })
          : Response.json({ ticket: 'fixture-ticket' });
      },
      openSocket() {
        const socket = new EventTarget();
        socket.close = () => {};
        socket.send = (message) => {
          const request = JSON.parse(message);
          queueMicrotask(() =>
            socket.dispatchEvent(
              new MessageEvent('message', {
                data: JSON.stringify({
                  _tag: 'Exit',
                  requestId: request.id,
                  exit:
                    request.id === 'quota' && fleet[id]
                      ? { _tag: 'Success', value: { providers: fleet[id] } }
                      : { _tag: 'Failure', cause: [] },
                }),
              })
            )
          );
        };
        readers[id] = true;
        queueMicrotask(() => socket.dispatchEvent(new Event('open')));
        return socket;
      },
    });
  };
  return { collect, readers };
}

const config = (id, environmentId) => ({
  id,
  environmentId,
  origin: `https://${id}.example.com`,
});
const CONFIGS = [config('local', 'env-local'), config('macstudio1', 'env-1')];
const MACHINES = CONFIGS.map(({ id }) => ({ id, label: id }));
const laneSources = new Map([
  [
    'local',
    {
      environmentId: null,
      lanes: [
        { threadId: 't1', instanceId: 'claudeAgent' },
        { threadId: 't2', instanceId: 'claude_1' },
        { threadId: 't3', instanceId: 'codex' },
      ],
    },
  ],
  [
    'macstudio1',
    {
      environmentId: 'env-1',
      lanes: [{ threadId: 't4', instanceId: 'claude_x' }],
    },
  ],
]);

function collector({ fleet = FLEET, configs = CONFIGS } = {}) {
  return usageCollector({
    root: '/fixture',
    configs,
    readSecret: () => 'fixture-bearer',
    now: NOW,
    signal: AbortSignal.timeout(5_000),
    collect: t3World(fleet).collect,
  });
}

const summary = (view) =>
  view.accounts
    .map((account) => [
      account.instances.map((i) => `${i.host}/${i.instanceId}`).join(' '),
      account.remainingPercent,
      account.activeCount,
    ])
    .sort();

test('merges accounts from every machine through the usage collector', async () => {
  const snapshot = await collector()(MACHINES);
  const view = snapshot.mergeAccounts(laneSources, NOW);
  assert.deepEqual(summary(view), [
    ['local/claudeAgent local/claude_1 macstudio1/claude_x', 45, 3],
    ['local/codex', 88, 1],
    ['macstudio1/claudeAgent', 93, 0],
  ]);
  const shared = view.accounts.find((a) => a.instances.length === 3);
  assert.deepEqual(shared.lanesByHost, { local: 2, macstudio1: 1 });
  assert.deepEqual(shared.windows[0].source, {
    host: 'macstudio1',
    instanceId: 'claude_x',
  });
  assert.doesNotMatch(
    JSON.stringify(view),
    /@example|fixture-org|cdcdcdcd|fixture-bearer|fixture-ticket/
  );
  // Private rows and keys never reach the published snapshot.
  assert.doesNotMatch(snapshot.body, PRIVATE);
  assert.deepEqual(
    JSON.parse(snapshot.body).machines.map((m) => Object.keys(m).sort()),
    Array(2).fill(['accounting', 'accounts', 'buckets', 'id', 'label', 'quota'])
  );
});

test('the reader keeps its private rows out of spreads and JSON', async () => {
  const usage = await t3World(FLEET).collect({
    ...CONFIGS[0],
    bearer: 'fixture-bearer',
    now: NOW,
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(usage.fleetRows.length, FLEET.local.length);
  assert.match(usage.fleetRows[0].accountKey, /^acct-/);
  assert.doesNotMatch(JSON.stringify(usage), PRIVATE);
  assert.doesNotMatch(JSON.stringify({ ...usage }), PRIVATE);
});

const injected = (quota, fleetRows) =>
  usageCollector({
    root: '/fixture',
    configs: [config('local', 'env-local')],
    readSecret: () => 'fixture-bearer',
    now: NOW,
    collect: async () => ({
      quota,
      accounting: { kind: 'unavailable' },
      accounts: [],
      buckets: [],
      fleetRows,
    }),
  })([MACHINES[0]]);

test('drops private rows from a reader that returns them enumerably', async () => {
  const { body } = await injected(
    { kind: 'complete', observedAt: NOW.toISOString() },
    [{ accountKey: `acct-${'e'.repeat(32)}` }]
  );
  assert.doesNotMatch(body, PRIVATE);
});

test('ignores rows from a reader that did not read the quota', async () => {
  const snapshot = await injected({ kind: 'unavailable' }, []);
  assert.deepEqual(snapshot.mergeAccounts(laneSources, NOW).hosts, [
    { host: 'local', read: 'failed', lanes: 'unknown' },
  ]);
});

const totals = async ({ machines = MACHINES, ...options } = {}) => {
  const view = (await collector(options)(machines)).mergeAccounts(
    laneSources,
    NOW
  );
  return {
    coverage: view.coverage,
    hosts: view.hosts.map((h) => `${h.host}:${h.read}:${h.lanes}`),
    counts: [...new Set(view.accounts.map((a) => a.activeCount))],
  };
};

test('a machine whose quota was not read makes totals unknown', async () => {
  const expected = {
    coverage: 'complete',
    hosts: ['local:ok:counted', 'macstudio1:failed:unknown'],
    counts: ['unknown'],
  };
  // T3 answered the socket but not the quota section.
  assert.deepEqual(await totals({ fleet: { local: FLEET.local } }), expected);
  // No reader configured for a fleet machine.
  assert.deepEqual(await totals({ configs: [CONFIGS[0]] }), expected);
});

test('a machine left out of the read makes the fleet partial', async () => {
  const unlisted = await totals({
    configs: [...CONFIGS, config('unlinked', 'env-unlinked')],
  });
  assert.equal(unlisted.coverage, 'partial');
  assert.deepEqual(unlisted.counts, ['unknown']);

  const crowd = Array.from({ length: 11 }, (_, i) => ({
    id: `extra-${i}`,
    label: 'Extra',
  }));
  const capped = await totals({ machines: [...MACHINES, ...crowd] });
  assert.equal(capped.coverage, 'partial');
  assert.equal(capped.hosts.length, 12);
});

function sandbox(usageMachines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-accounts-'));
  const paths = {
    root,
    database: ':memory:',
    secretFile: path.join(root, 'publisher-secret'),
    configFile: path.join(root, 'config.json'),
    openDir: path.join(root, 'decisions/open'),
    answersDir: path.join(root, 'decisions/answers'),
    stampFile: path.join(root, 'last-publish.json'),
    peerSecretsDir: path.join(root, 't3-secrets'),
    peerCacheFile: path.join(root, 'peer-cache.json'),
  };
  fs.mkdirSync(paths.openDir, { recursive: true });
  fs.mkdirSync(paths.peerSecretsDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'usage-readers'), { mode: 0o700 });
  for (const file of [
    paths.secretFile,
    path.join(root, 'usage-readers', 'local'),
    path.join(root, 'usage-readers', 'macstudio1'),
    path.join(paths.peerSecretsDir, 'peer-link-kept-out.bin'),
  ])
    fs.writeFileSync(file, 'fixture-secret-'.padEnd(44, 'f'), { mode: 0o600 });
  const write = (machines) =>
    fs.writeFileSync(
      paths.configFile,
      JSON.stringify({
        machineId: 'local',
        machineLabel: 'Local',
        ...(machines ? { usageMachines: machines } : {}),
      })
    );
  write(usageMachines);
  return {
    paths,
    write,
    file: path.join(root, 'usage-fleet-accounts.json'),
  };
}

/** One linked machine, with instance ids on the local runs. */
function database() {
  const db = fixtureDatabase();
  db.exec(`
    DELETE FROM peer_environment_links WHERE environment_id = 'env-2';
    ALTER TABLE orchestration_v2_projection_runs
      ADD COLUMN provider_instance_id TEXT;
    UPDATE orchestration_v2_projection_runs SET provider_instance_id =
      CASE thread_id WHEN 't-iris' THEN 'claudeAgent'
        WHEN 't-arch' THEN 'claude_1' ELSE 'codex' END;
  `);
  return db;
}

function publish(paths, { openDatabase = database, peerDown = false } = {}) {
  const bodies = [];
  const peers = fakePeers({
    'https://relay.example.test': {
      environmentId: 'env-1',
      token: 'fixture-secret-'.padEnd(44, 'f'),
      down: peerDown,
      list: threadLister(
        [
          ['p-run', 'running', 'claude_x'],
          ['p-done', 'completed', 'claudeAgent'],
        ].map(([threadId, status, providerInstanceId]) => ({
          threadId,
          status,
          providerInstanceId,
          title: threadId,
          latestRunId: 'run',
          updatedAt: ago(60_000),
        }))
      ),
    },
  });
  return {
    bodies,
    run: () =>
      runOnce({
        paths,
        origin: 'https://tuturuuu.com',
        now: NOW,
        openDatabase: () => openDatabase(),
        peerFetchImpl: peers.fetchImpl,
        collectUsage: t3World(FLEET).collect,
        async fetchImpl(url, init) {
          bodies.push(String(init.body ?? ''));
          return {
            ok: true,
            status: 200,
            json: async () =>
              init.method === 'GET' ? { answers: [] } : { accepted: true },
          };
        },
      }),
  };
}

const readView = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('the publisher keeps the account view in a private file', async () => {
  const { paths, file, write } = sandbox(CONFIGS);
  const publisher = publish(paths);
  assert.equal((await publisher.run()).usagePublished, true);
  const view = readView(file);
  assert.equal(view.status, 'ok');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(view.hosts, [
    { host: 'local', read: 'ok', lanes: 'counted' },
    { host: 'macstudio1', read: 'ok', lanes: 'counted' },
  ]);
  assert.deepEqual(summary(view), [
    ['local/claudeAgent local/claude_1 macstudio1/claude_x', 45, 3],
    ['local/codex', 88, 1],
    ['macstudio1/claudeAgent', 93, 0],
  ]);
  for (const body of publisher.bodies) assert.doesNotMatch(body, PRIVATE);

  // Removing the readers removes the view they produced.
  write(undefined);
  await publish(paths).run();
  assert.equal(fs.existsSync(file), false);
});

test('an unreachable linked machine makes published-host totals unknown', async () => {
  const { paths, file } = sandbox(CONFIGS);
  await publish(paths, { peerDown: true }).run();
  const view = readView(file);
  assert.deepEqual(view.hosts[1], {
    host: 'macstudio1',
    read: 'ok',
    lanes: 'unknown',
  });
  assert.ok(view.accounts.every((a) => a.activeCount === 'unknown'));
});

test('a projection without instance ids leaves local lanes unknown', async () => {
  const { paths, file } = sandbox(CONFIGS);
  const result = await publish(paths, {
    openDatabase: () => {
      const db = fixtureDatabase();
      db.exec(
        "DELETE FROM peer_environment_links WHERE environment_id = 'env-2'"
      );
      return db;
    },
  }).run();
  assert.equal(result.published, true);
  assert.equal(readView(file).hosts[0].lanes, 'unknown');
});

test('a failed usage read replaces the view with a closed reason', async () => {
  const { paths, file, write } = sandbox(CONFIGS);
  await publish(paths).run();
  write([{ id: 'not a key' }]);
  const result = await publish(paths).run();
  assert.equal(result.usagePublished, undefined);
  assert.deepEqual(Object.keys(readView(file)).sort(), [
    'generatedAt',
    'reason',
    'status',
    'v',
  ]);
  assert.equal(readView(file).reason, 'usage_unavailable');
});

test('an unwritable view never interrupts publishing', async () => {
  const { paths, file } = sandbox(CONFIGS);
  fs.mkdirSync(path.join(file, 'occupied'), { recursive: true });
  const result = await publish(paths).run();
  assert.equal(result.published, true);
  assert.equal(result.usagePublished, true);
});

test('privacy assertion detects the fixture credential fingerprint on its own', () => {
  assert.match(JSON.stringify({ value: FINGERPRINT }), PRIVATE);
});
