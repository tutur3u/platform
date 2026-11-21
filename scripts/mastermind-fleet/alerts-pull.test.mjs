import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ALERTS_MIN_REMAINING_MS,
  parseFleetAlerts,
  pullAlerts,
} from './alerts-pull.mjs';
import { fixtureDatabase } from './fixture.mjs';
import { runOnce } from './publish.mjs';

const SECRET = 'fleet-publisher-secret-for-tests-0123456789';
const NOW = new Date('2026-11-21T03:05:00.000Z');
const PAGE = {
  id: 'slo-workers-availability-page-tuturuuu-meet-2-0123456789abcdef',
  service: 'tuturuuu-meet',
  severity: 'page',
  indicator: 'availability',
  burnLong: 20.5,
  burnShort: 30,
  startedAt: '2026-11-21T03:00:00Z',
};
const TICKET = {
  ...PAGE,
  id: 'slo-workers-latency-ticket-web-2026-fedcba9876543210',
  service: 'web',
  severity: 'ticket',
  indicator: 'latency',
};

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-alerts-'));
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
    alertsFile: path.join(root, 'alerts.json'),
  };
  fs.writeFileSync(paths.secretFile, SECRET, { mode: 0o600 });
  fs.mkdirSync(paths.peerSecretsDir, { recursive: true });
  fs.mkdirSync(paths.openDir, { recursive: true });
  return paths;
}

function server(alerts) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
    calls.push(`${init.method} ${pathname}`);
    if (pathname.endsWith('/alerts')) {
      if (alerts instanceof Error) throw alerts;
      if (alerts === 503)
        return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ alerts }) };
    }
    const body = init.method === 'GET' ? { answers: [] } : { accepted: true };
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl };
}

/** Mode and contents through one descriptor, so both describe one file. */
function readPrivate(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    return {
      mode: fs.fstatSync(fd).mode & 0o777,
      text: fs.readFileSync(fd, 'utf8'),
    };
  } finally {
    fs.closeSync(fd);
  }
}

const run = (paths, fake, now = NOW) =>
  runOnce({
    paths,
    origin: 'https://tuturuuu.com',
    now,
    fetchImpl: fake.fetchImpl,
    openDatabase: () => fixtureDatabase(),
  });

test('pulls alerts after the publish and answer pickup, into a 0600 file', async () => {
  const paths = sandbox();
  const fake = server([PAGE, TICKET, { id: 'Bad Id', severity: 'page' }]);
  const result = await run(paths, fake);
  assert.deepEqual(fake.calls, [
    'PUT /api/v1/mastermind/fleet/state',
    'GET /api/v1/mastermind/fleet/answers',
    'GET /api/v1/mastermind/fleet/alerts',
  ]);
  assert.deepEqual(result.alerts, { firing: 2, pages: 1 });
  const written = readPrivate(paths.alertsFile);
  assert.equal(written.mode, 0o600);
  assert.deepEqual(JSON.parse(written.text), {
    fetchedAt: NOW.toISOString(),
    alerts: [PAGE, TICKET],
  });
  // Written by rename: no temp file is left beside it.
  assert.deepEqual(
    fs.readdirSync(paths.root).filter((name) => name.includes('alerts')),
    ['alerts.json']
  );
});

test('a failed pull keeps the previous file and logs counts only', async () => {
  const paths = sandbox();
  await run(paths, server([PAGE]));
  const before = readPrivate(paths.alertsFile).text;
  for (const failure of [
    503,
    new Error('network down'),
    'not-a-list',
    [{ id: 'Bad Id', severity: 'page' }],
  ]) {
    const result = await run(
      paths,
      server(failure),
      new Date(NOW.getTime() + 60_000)
    );
    assert.deepEqual(result.alerts, { failed: true });
    assert.equal(readPrivate(paths.alertsFile).text, before);
  }
});

test('skips the pull when the tick budget is short, never the publish', async (t) => {
  const write = t.mock.fn();
  const get = t.mock.fn();
  const result = await pullAlerts({
    get,
    write,
    file: '/unused',
    tickEnd: Date.now() + ALERTS_MIN_REMAINING_MS - 1,
    now: NOW,
  });
  assert.deepEqual(result, { skipped: 'budget' });
  assert.equal(get.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test('runs without an alerts file path, as older installs do', async () => {
  const { alertsFile: _alertsFile, ...paths } = sandbox();
  const fake = server([PAGE]);
  const result = await run(paths, fake);
  assert.equal(result.alerts, undefined);
  assert.ok(!fake.calls.some((call) => call.endsWith('/alerts')));
});

test('re-checks every field and caps the list', () => {
  assert.equal(parseFleetAlerts({}), null);
  assert.deepEqual(
    parseFleetAlerts([
      { ...PAGE, burnLong: Number.NaN },
      { ...PAGE, severity: 'critical' },
      { ...PAGE, startedAt: 'yesterday' },
      { ...PAGE, extra: 'dropped' },
    ]),
    [PAGE]
  );
  assert.equal(
    parseFleetAlerts(Array.from({ length: 30 }, () => PAGE)).length,
    20
  );
});
