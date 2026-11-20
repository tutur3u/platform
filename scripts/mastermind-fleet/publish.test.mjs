import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureDatabase } from './fixture.mjs';
import { parseDecision, readSecret, runOnce, signRequest } from './publish.mjs';

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
  };
  fs.writeFileSync(paths.secretFile, SECRET, { mode: 0o600 });
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
