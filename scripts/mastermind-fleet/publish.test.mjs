import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fakePeers, fixtureDatabase, threadLister } from './fixture.mjs';
import { readPokes } from './poke.mjs';
import {
  acquirePublishLock,
  fitToBudget,
  parseDecision,
  readDecisions,
  readSecret,
  runOnce,
  signRequest,
} from './publish.mjs';

const SECRET = 'fleet-publisher-secret-for-tests-0123456789';
const NOW = new Date('2026-11-20T03:00:00.000Z');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-sync-'));
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
  fs.writeFileSync(paths.secretFile, SECRET, { mode: 0o600 });
  fs.mkdirSync(paths.peerSecretsDir, { recursive: true });
  fs.mkdirSync(paths.openDir, { recursive: true });
  return paths;
}

function verify(request) {
  const url = new URL(request.url);
  const expected = createHmac('sha256', SECRET)
    .update(
      `${request.headers['x-mm-timestamp']}.${request.method} ${url.pathname}${url.search}\n${request.body ?? ''}`
    )
    .digest('hex');
  return expected === request.headers['x-mm-signature'];
}

function fakeServer(answers = []) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const call = { url, ...init };
    calls.push(call);
    assert.ok(verify(call), `signature for ${init.method} ${url}`);
    assert.equal(init.redirect, 'error');
    const body = init.method === 'GET' ? { answers } : { accepted: true };
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl };
}

test('signs method, path with query and body like the Web route', () => {
  const headers = signRequest(SECRET, 'get', '/x?nonce=1', '', NOW.getTime());
  assert.equal(headers['x-mm-timestamp'], String(NOW.getTime() / 1000));
  assert.ok(verify({ url: 'https://h/x?nonce=1', method: 'GET', headers }));
});

test('refuses a group-readable or short secret', () => {
  const paths = sandbox();
  fs.chmodSync(paths.secretFile, 0o644);
  assert.throws(() => readSecret(paths.secretFile), /secret_file_permissions/);
  fs.writeFileSync(paths.secretFile, 'short', { mode: 0o600 });
  fs.chmodSync(paths.secretFile, 0o600);
  assert.throws(() => readSecret(paths.secretFile), /secret_too_short/);
});

test('reads the secret through the descriptor it checked', (t) => {
  const paths = sandbox();
  const impostor = path.join(paths.root, 'impostor');
  fs.writeFileSync(impostor, 'x'.repeat(40), { mode: 0o644 });
  // Swap the path right after the permission check, whichever stat runs it.
  for (const name of ['statSync', 'lstatSync', 'fstatSync']) {
    const original = fs[name];
    t.mock.method(fs, name, (...args) => {
      const stat = original(...args);
      if (fs.existsSync(impostor)) fs.renameSync(impostor, paths.secretFile);
      return stat;
    });
  }
  assert.equal(readSecret(paths.secretFile), SECRET);
});

test('parses decision files and drops unusable ones', () => {
  assert.equal(
    parseDecision({ id: 'Bad Id', title: 'x', createdAt: NOW.toISOString() }),
    null
  );
  assert.equal(
    parseDecision({ id: 'ok', title: '', createdAt: NOW.toISOString() }),
    null
  );
  assert.deepEqual(
    parseDecision({
      id: 'ship',
      title: 'Ship?',
      urgency: 'weird',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'No!', label: 'bad' },
      ],
      recommendedOptionId: 'No!',
      createdAt: NOW.toISOString(),
    }),
    {
      id: 'ship',
      title: 'Ship?',
      urgency: 'normal',
      options: [{ id: 'yes', label: 'Yes' }],
      createdAt: NOW.toISOString(),
    }
  );
});

test('clips decision text to the contract caps the edge guard accepts', () => {
  const decision = parseDecision({
    id: 'long',
    title: 'Ship the release '.repeat(18),
    body: 'Body text '.repeat(300),
    urgency: 'urgent',
    options: [{ id: 'go', label: 'Approve it '.repeat(30) }],
    recommendedOptionId: 'go',
    createdAt: '2026-11-21T09:00:00+07:00',
  });
  assert.ok(decision.title.length <= 120);
  assert.ok(decision.title.endsWith('...'));
  assert.ok(decision.body.length <= 600);
  assert.ok(decision.options[0].label.length <= 60);
  assert.equal(decision.recommendedOptionId, 'go');
  assert.equal(decision.createdAt, '2026-11-21T02:00:00.000Z');
});

test('skips decision files the contract would reject and counts them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-open-'));
  const write = (name, value) =>
    fs.writeFileSync(
      path.join(dir, name),
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  const base = { title: 'Ship?', createdAt: NOW.toISOString() };
  write('ok.json', { id: 'ok', ...base });
  write('upper.json', { id: 'Iris-Upper', ...base });
  write('long-id.json', { id: 'x'.repeat(65), ...base });
  write('no-time.json', { id: 'no-time', title: 'Ship?' });
  write('bad-time.json', { id: 'bad-time', title: 'Ship?', createdAt: 'soon' });
  write('broken.json', '{nope');
  write('notes.txt', 'ignored');
  const { decisions, skipped } = readDecisions(dir);
  assert.deepEqual(
    decisions.map((d) => d.id),
    ['ok']
  );
  assert.equal(skipped, 5);
});

test('publishes lanes from linked machines with their machine ids', async () => {
  const paths = sandbox();
  fs.writeFileSync(
    path.join(paths.peerSecretsDir, 'peer-link-kept-out.bin'),
    'peer-token-0123456789abcdef',
    { mode: 0o600 }
  );
  const peers = fakePeers({
    'https://relay.example.test': {
      environmentId: 'env-1',
      token: 'peer-token-0123456789abcdef',
      list: threadLister([
        {
          threadId: 'studio-1',
          title: 'Studio lane',
          status: 'running',
          latestRunId: 'run-1',
          projectId: 'p',
          updatedAt: '2026-11-20T02:59:00.000Z',
        },
      ]),
    },
  });
  const server = fakeServer([]);
  const result = await runOnce({
    paths,
    origin: 'https://tuturuuu.com',
    now: NOW,
    fetchImpl: server.fetchImpl,
    peerFetchImpl: peers.fetchImpl,
    openDatabase: () => fixtureDatabase(),
  });
  const put = server.calls.find((call) => call.method === 'PUT');
  const published = JSON.parse(put.body);
  const studio = published.lanes.find((lane) => lane.title === 'Studio lane');
  assert.equal(studio.machineId, 'macstudio1');
  assert.equal(
    published.machines.find((m) => m.id === 'macstudio1').status,
    'online'
  );
  assert.equal(published.counts.running, 3);
  assert.deepEqual(result.machines.macstudio1, {
    status: 'online',
    active: 1,
    lanes: 1,
  });
  assert.equal(fs.statSync(paths.peerCacheFile).mode & 0o777, 0o600);
  assert.ok(!put.body.includes('peer-token'));
});

test('publishes on change, heartbeats, and stores then acks answers', async () => {
  const paths = sandbox();
  fs.writeFileSync(
    path.join(paths.openDir, 'ship.json'),
    JSON.stringify({
      id: 'ship',
      title: 'Ship?',
      urgency: 'high',
      createdAt: NOW.toISOString(),
    })
  );
  fs.writeFileSync(path.join(paths.openDir, 'broken.json'), '{nope');
  const answer = {
    decisionId: 'ship',
    revision: 2,
    action: 'reply',
    text: 'Wait',
    answeredAt: NOW.toISOString(),
  };
  const server = fakeServer([answer]);
  const options = {
    paths,
    origin: 'https://tuturuuu.com',
    fetchImpl: server.fetchImpl,
    openDatabase: () => fixtureDatabase(),
  };

  const first = await runOnce({ ...options, now: NOW });
  assert.equal(first.published, true);
  assert.equal(first.decisions, 1);
  assert.equal(first.skippedDecisions, 1);
  assert.equal(first.answers, 1);
  assert.deepEqual(
    server.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
    [
      'PUT /api/v1/mastermind/fleet/state',
      'GET /api/v1/mastermind/fleet/answers',
      'POST /api/v1/mastermind/fleet/answers',
    ]
  );
  const published = JSON.parse(server.calls[0].body);
  assert.equal(published.decisions[0].id, 'ship');
  assert.deepEqual(JSON.parse(server.calls[2].body), {
    acks: [{ decisionId: 'ship', revision: 2 }],
  });
  const stored = path.join(paths.answersDir, 'ship.r2.json');
  assert.equal(fs.statSync(stored).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(stored, 'utf8')).text, 'Wait');

  const quiet = fakeServer([]);
  const unchanged = await runOnce({
    ...options,
    fetchImpl: quiet.fetchImpl,
    now: new Date(NOW.getTime() + 30_000),
  });
  assert.equal(unchanged.published, false);
  assert.equal(quiet.calls.length, 1);

  const heartbeat = await runOnce({
    ...options,
    fetchImpl: fakeServer([]).fetchImpl,
    now: new Date(NOW.getTime() + 3 * 60_000),
  });
  assert.equal(heartbeat.published, true);
});

test('refuses a cleartext or path-bearing origin', async () => {
  const paths = sandbox();
  for (const origin of [
    'http://tuturuuu.com',
    'https://tuturuuu.com/api',
    undefined,
  ]) {
    await assert.rejects(
      runOnce({ paths, origin, openDatabase: () => fixtureDatabase() }),
      /origin_must_be_https/
    );
  }
});

test('fits the body budget without dropping active lanes first', () => {
  const lane = (i, state) => ({
    id: `lane-${String(i).padStart(16, '0')}`,
    title: 'x'.repeat(70),
    machineId: 'macstudio1',
    state,
    updatedAt: NOW.toISOString(),
  });
  const state = {
    version: 1,
    lanes: [
      ...Array.from({ length: 250 }, (_, i) => lane(i, 'running')),
      ...Array.from({ length: 50 }, (_, i) => lane(300 + i, 'idle')),
    ],
    decisions: Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      title: 'Decision',
      body: '部'.repeat(600),
    })),
  };
  const { state: fitted, bytes } = fitToBudget(state, 80 * 1024);
  assert.ok(bytes <= 80 * 1024);
  assert.equal(fitted.lanes.filter((l) => l.state === 'running').length, 250);
  assert.equal(fitted.lanes.filter((l) => l.state === 'idle').length, 0);
  assert.ok(fitted.decisions.every((d) => d.body === undefined));
  assert.equal(fitted.decisions.length, 50);
});

test('compacts lane detail before dropping any active lane', () => {
  const lane = (i) => ({
    id: `lane-${String(i).padStart(16, '0')}`,
    title: 'Running lane title',
    project: '部'.repeat(40),
    provider: 'p'.repeat(24),
    model: 'm'.repeat(40),
    machineId: 'macstudio1',
    state: 'running',
    updatedAt: NOW.toISOString(),
  });
  const state = {
    version: 1,
    lanes: Array.from({ length: 280 }, (_, i) => lane(i)),
    decisions: Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      title: '部'.repeat(118),
      body: '部'.repeat(598),
    })),
  };
  const { state: fitted, bytes } = fitToBudget(state, 96 * 1024);
  assert.ok(bytes <= 96 * 1024);
  assert.equal(fitted.lanes.length, 280);
  assert.equal(fitted.lanes[0].project, undefined);
});

test('skips Web calls once the run budget is spent', async (t) => {
  const paths = sandbox();
  const server = fakeServer([]);
  const realNow = Date.now;
  let calls = 0;
  t.mock.method(Date, 'now', () => realNow() + (calls++ > 0 ? 60_000 : 0));
  await assert.rejects(
    runOnce({
      paths,
      origin: 'https://tuturuuu.com',
      now: NOW,
      fetchImpl: server.fetchImpl,
      openDatabase: () => fixtureDatabase(),
    }),
    /tick_budget_exhausted/
  );
  assert.equal(server.calls.length, 0);
});

test('skips a FIFO decision file without blocking', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-fifo-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('mkfifo', [path.join(dir, 'stuck.json')]);
  fs.writeFileSync(
    path.join(dir, 'ok.json'),
    JSON.stringify({ id: 'ok', title: 'Ship?', createdAt: NOW.toISOString() })
  );
  const { decisions, skipped } = readDecisions(dir);
  assert.deepEqual(
    decisions.map((d) => d.id),
    ['ok']
  );
  assert.equal(skipped, 1);
});

test('a refused addition falls back to the v1 core and still picks up answers', async () => {
  const paths = sandbox();
  paths.releaseFile = path.join(paths.root, 'release.json');
  fs.writeFileSync(
    paths.releaseFile,
    JSON.stringify({ main: { state: 'frozen', reason: '*****' } })
  );
  fs.writeFileSync(
    path.join(paths.openDir, 'ship.json'),
    JSON.stringify({
      id: 'ship',
      title: 'Ship?',
      urgency: 'high',
      why: 'Train is ready',
      createdAt: NOW.toISOString(),
    })
  );
  const bodies = [];
  const fetchImpl = async (url, init) => {
    if (init.method === 'PUT') {
      bodies.push(JSON.parse(init.body));
      // The server refuses the first body (too large here).
      if (bodies.length === 1)
        return { ok: false, status: 413, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => (init.method === 'GET' ? { answers: [] } : {}),
    };
  };
  const result = await runOnce({
    paths,
    origin: 'https://tuturuuu.com',
    fetchImpl,
    openDatabase: () => fixtureDatabase(),
    now: NOW,
  });
  assert.equal(result.degraded, true);
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].release);
  assert.equal(bodies[1].release, undefined);
  assert.equal(bodies[1].decisions[0].why, undefined);
  assert.equal(bodies[1].decisions[0].id, 'ship');
});

test('a degraded publish stays reported until the full snapshot lands', async () => {
  const paths = sandbox();
  paths.releaseFile = path.join(paths.root, 'release.json');
  fs.writeFileSync(
    paths.releaseFile,
    JSON.stringify({ main: { state: 'frozen' } })
  );
  const refuse = async (url, init) =>
    init.method === 'PUT' && JSON.parse(init.body).release
      ? { ok: false, status: 422, json: async () => ({}) }
      : {
          ok: true,
          status: 200,
          json: async () => (init.method === 'GET' ? { answers: [] } : {}),
        };
  const options = {
    paths,
    origin: 'https://tuturuuu.com',
    fetchImpl: refuse,
    openDatabase: () => fixtureDatabase(),
  };
  assert.equal((await runOnce({ ...options, now: NOW })).degraded, true);
  const quiet = await runOnce({
    ...options,
    now: new Date(NOW.getTime() + 30_000),
  });
  assert.equal(quiet.published, false);
  assert.equal(quiet.degraded, true);
});

test('acknowledges pulled answers in batches the route accepts', async () => {
  const paths = sandbox();
  const answers = Array.from({ length: 150 }, (_, i) => ({
    decisionId: `d${i}`,
    revision: 1,
    action: 'approve',
    answeredAt: NOW.toISOString(),
  }));
  const acks = [];
  const fetchImpl = async (url, init) => {
    if (init.method === 'POST') acks.push(JSON.parse(init.body).acks.length);
    return {
      ok: true,
      status: 200,
      json: async () => (init.method === 'GET' ? { answers } : {}),
    };
  };
  const result = await runOnce({
    paths,
    origin: 'https://tuturuuu.com',
    fetchImpl,
    openDatabase: () => fixtureDatabase(),
    now: NOW,
  });
  assert.equal(result.answers, 150);
  assert.deepEqual(acks, [100, 50]);
});

test('trims additions, then login requests, before any ask', () => {
  const ask = (i) => ({
    id: `a${i}`,
    title: 'Ask '.repeat(20),
    urgency: 'normal',
  });
  const login = (i) => ({
    id: `l${i}`,
    kind: 'login',
    title: 'Sign in '.repeat(10),
    urgency: 'high',
  });
  const state = {
    version: 1,
    lanes: [],
    decisions: [ask(0), login(0), ask(1), login(1)],
    resolved: [{ id: 'r', title: 'x'.repeat(2000) }],
    release: { main: { state: 'open', reason: 'y'.repeat(2000) } },
  };
  const core = { ...state, resolved: undefined, release: undefined };
  const coreBytes = Buffer.byteLength(JSON.stringify(core));
  const { state: noExtras } = fitToBudget(state, coreBytes + 10);
  assert.equal(noExtras.resolved, undefined);
  assert.equal(noExtras.release, undefined);
  assert.equal(noExtras.decisions.length, 4);
  const { state: tight } = fitToBudget(state, coreBytes - 50);
  assert.deepEqual(
    tight.decisions.map((d) => d.id),
    ['a0', 'l0', 'a1']
  );
});

test('login requests never crowd asks out of the snapshot', () => {
  const paths = sandbox();
  const at = (i) => new Date(NOW.getTime() - (100 - i) * 60_000).toISOString();
  for (let i = 0; i < 30; i++)
    fs.writeFileSync(
      path.join(paths.openDir, `login-${i}.json`),
      JSON.stringify({
        id: `login-${i}`,
        kind: 'login',
        title: 'Sign in',
        urgency: 'high',
        createdAt: at(i),
        login: {
          service: 'github',
          flow: 'device',
          url: 'https://github.com/login/device',
          userCode: 'ABCD-1234',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      })
    );
  // 45 asks: all fit, with the 10 newest open logins on top.
  for (let i = 30; i < 75; i++)
    fs.writeFileSync(
      path.join(paths.openDir, `ask-${i}.json`),
      JSON.stringify({
        id: `ask-${i}`,
        title: 'Ask',
        urgency: 'normal',
        createdAt: at(i),
      })
    );
  const { decisions } = readDecisions(paths.openDir);
  assert.equal(decisions.length, 55);
  assert.equal(decisions.filter((d) => d.kind === 'login').length, 10);
  assert.equal(decisions.filter((d) => d.kind !== 'login').length, 45);
});

test('a failed answer pickup reports the failure after publishing', async () => {
  const paths = sandbox();
  const methods = [];
  const fetchImpl = async (url, init) => {
    methods.push(init.method);
    if (init.method === 'GET')
      return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await assert.rejects(
    runOnce({
      paths,
      origin: 'https://tuturuuu.com',
      fetchImpl,
      openDatabase: () => fixtureDatabase(),
      now: NOW,
    }),
    /GET .* 503/
  );
  assert.deepEqual(methods, ['PUT', 'GET']);
});

test('only one publisher runs at a time, and a stale lock is taken over', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-lock-'));
  const release = acquirePublishLock(root);
  assert.throws(() => acquirePublishLock(root), /publisher_busy/);
  release();
  const again = acquirePublishLock(root);
  // A lock left by a killed run is taken over once stale.
  assert.ok(acquirePublishLock(root, Date.now() + 120_000));
  again();
});

test('publishes configured usage after state and owner answers, with a bounded heartbeat', async () => {
  const paths = sandbox();
  const server = fakeServer();
  const readers = path.join(paths.root, 'usage-readers');
  fs.mkdirSync(readers, { mode: 0o700 });
  fs.writeFileSync(
    path.join(readers, 'local'),
    'fixture-usage-bearer-0123456789abcdefgh',
    {
      mode: 0o600,
    }
  );
  fs.writeFileSync(
    paths.configFile,
    JSON.stringify({
      machineId: 'local',
      machineLabel: 'Local',
      usageMachines: [
        {
          id: 'local',
          origin: 'http://127.0.0.1:3773',
          environmentId: 'fixture-environment',
        },
      ],
    })
  );
  const options = {
    paths,
    origin: 'https://tuturuuu.com',
    now: NOW,
    fetchImpl: server.fetchImpl,
    openDatabase: () => fixtureDatabase(),
    async collectUsage({ bearer, now }) {
      assert.equal(bearer, 'fixture-usage-bearer-0123456789abcdefgh');
      return {
        quota: { kind: 'complete', observedAt: now.toISOString() },
        accounting: { kind: 'unavailable' },
        accounts: [],
        buckets: [],
      };
    },
  };
  assert.equal((await runOnce(options)).usagePublished, true);
  assert.deepEqual(
    server.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
    [
      'PUT /api/v1/mastermind/fleet/state',
      'GET /api/v1/mastermind/fleet/answers',
      'PUT /api/v1/mastermind/fleet/usage',
    ]
  );
  assert.equal(
    JSON.parse(server.calls[2].body).machines[0].quota.kind,
    'complete'
  );
  assert.doesNotMatch(server.calls[2].body, /fixture-usage-bearer/);

  const pokeDir = path.join(paths.root, 'pokes');
  const revision = NOW.getTime();
  assert.deepEqual(
    readPokes(pokeDir),
    ['state', 'usage'].map((topic) => ({
      topic,
      revision,
      observedAt: NOW.toISOString(),
    }))
  );

  server.calls.length = 0;
  const quiet = await runOnce({
    ...options,
    now: new Date(NOW.getTime() + 15_000),
  });
  assert.equal(quiet.usagePublished, undefined);
  assert.equal(server.calls.length, 1);
  assert.equal(readPokes(pokeDir)[1].revision, revision);

  const refused = await runOnce({
    ...options,
    now: new Date(revision + 30_000),
    force: true,
    async fetchImpl(url, init) {
      if (new URL(url).pathname.endsWith('/usage')) {
        return Response.json({ accepted: false });
      }
      return server.fetchImpl(url, init);
    },
  });
  assert.equal(refused.usagePublished, false);
  assert.equal(readPokes(pokeDir)[1].revision, revision);

  const next = await runOnce({
    ...options,
    now: new Date(NOW.getTime() + 60_000),
  });
  assert.equal(next.usagePublished, true);
  assert.equal(readPokes(pokeDir)[1].revision, revision + 60_000);
});
