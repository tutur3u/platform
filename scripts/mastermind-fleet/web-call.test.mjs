import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureDatabase } from './fixture.mjs';
import { runOnce, signRequest } from './publish.mjs';
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  callWeb,
  createWebBackoff,
  isRateLimited,
  retryAfterMs,
} from './web-call.mjs';

const SECRET = 'fleet-test-'.padEnd(44, 'f');
const NOW = new Date('2026-11-20T03:00:00.000Z');
const STATE = 'PUT /api/v1/mastermind/fleet/state';
const ANSWERS = 'GET /api/v1/mastermind/fleet/answers';
const ACKS = 'POST /api/v1/mastermind/fleet/answers';
const ALERTS = 'GET /api/v1/mastermind/fleet/alerts';
const ANSWER = {
  decisionId: 'ship',
  revision: 2,
  action: 'choose',
  optionId: 'yes',
  answeredAt: NOW.toISOString(),
};

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-web-call-'));
  const paths = {
    root,
    database: ':memory:',
    secretFile: path.join(root, 'publisher-secret'),
    configFile: path.join(root, 'config.json'),
    openDir: path.join(root, 'decisions/open'),
    answersDir: path.join(root, 'decisions/answers'),
    stampFile: path.join(root, 'last-publish.json'),
    alertsFile: path.join(root, 'alerts.json'),
    peerSecretsDir: path.join(root, 't3-secrets'),
    peerCacheFile: path.join(root, 'peer-cache.json'),
  };
  fs.writeFileSync(paths.secretFile, SECRET, { mode: 0o600 });
  fs.mkdirSync(paths.peerSecretsDir, { recursive: true });
  fs.mkdirSync(paths.openDir, { recursive: true });
  return paths;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};
const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });

/**
 * Web double: `limited` maps a route to the `Retry-After` its 429 carries, and
 * `sequence` to the statuses its first calls answer with.
 */
function fakeWeb({
  limited = {},
  failing = {},
  sequence = {},
  answers = [],
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const route = `${init.method} ${new URL(url).pathname}`;
    calls.push(route);
    const scripted = sequence[route]?.shift();
    if (scripted) return { ok: false, status: scripted };
    if (route in limited)
      return {
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': limited[route] }),
      };
    if (route in failing) return { ok: false, status: failing[route] };
    const body =
      route === ANSWERS
        ? { answers }
        : route === ALERTS
          ? { alerts: [] }
          : { accepted: true };
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl };
}

function run(paths, web, more = {}) {
  return runOnce({
    paths,
    origin: 'https://tuturuuu.com',
    now: NOW,
    fetchImpl: web.fetchImpl,
    peerFetchImpl: async () => {
      throw new Error('no peers');
    },
    openDatabase: () => fixtureDatabase(),
    ...more,
  });
}

const pauseFile = (paths) => path.join(paths.root, 'web-backoff.json');

test('Retry-After is read as seconds or a date and clamped to the pause bounds', () => {
  const now = NOW.getTime();
  assert.equal(retryAfterMs('60', now), 60_000);
  assert.equal(retryAfterMs(new Date(now + 90_000).toUTCString(), now), 90_000);
  assert.equal(retryAfterMs('1', now), BACKOFF_MIN_MS);
  assert.equal(retryAfterMs('0', now), BACKOFF_MIN_MS);
  assert.equal(retryAfterMs('86028', now), BACKOFF_MAX_MS);
  assert.equal(
    retryAfterMs(new Date(now - 5_000).toUTCString(), now),
    BACKOFF_MIN_MS
  );
  for (const header of [undefined, null, '', 'soon', '-5', '1e9', '1.5'])
    assert.equal(retryAfterMs(header, now), BACKOFF_MIN_MS, String(header));
});

test('a pause is stored per route, expires, and never exceeds the cap', () => {
  const file = path.join(sandbox().root, 'web-backoff.json');
  let clock = NOW.getTime();
  const backoff = createWebBackoff({
    file,
    read: readJson,
    write: writeJson,
    now: () => clock,
  });
  assert.equal(backoff.until(ANSWERS), 0);
  assert.equal(backoff.note(ANSWERS, '60'), clock + 60_000);
  assert.equal(backoff.until(ANSWERS), clock + 60_000);
  assert.equal(backoff.until(ALERTS), 0);

  backoff.note(ALERTS, '30');
  assert.deepEqual(
    Object.keys(readJson(file)).sort(),
    [ALERTS, ANSWERS].sort()
  );
  clock += 45_000;
  assert.equal(backoff.until(ALERTS), 0);
  assert.equal(backoff.until(ANSWERS), NOW.getTime() + 60_000);
  // Recording another pause drops the expired one from the file.
  backoff.note(STATE, '20');
  assert.deepEqual(Object.keys(readJson(file)).sort(), [ANSWERS, STATE].sort());

  writeJson(file, { [ANSWERS]: clock + 7 * 86_400_000, [ALERTS]: 'tomorrow' });
  assert.equal(backoff.until(ANSWERS), clock + BACKOFF_MAX_MS);
  assert.equal(backoff.until(ALERTS), 0);
});

test('an unreadable or unwritable pause file never fails a call', () => {
  const backoff = createWebBackoff({
    file: '/nonexistent/web-backoff.json',
    read: () => null,
    write: () => {
      throw new Error('EACCES');
    },
  });
  assert.equal(backoff.until(ANSWERS), 0);
  assert.ok(backoff.note(ANSWERS, '60') > Date.now());
});

test('a 429 pauses only its own route, and a paused route sends nothing', async () => {
  const paths = sandbox();
  const web = fakeWeb({ limited: { [ANSWERS]: '120' } });
  const options = {
    fetchImpl: web.fetchImpl,
    origin: 'https://tuturuuu.com',
    secret: SECRET,
    sign: signRequest,
    tickEnd: Date.now() + 20_000,
    backoff: createWebBackoff({
      file: pauseFile(paths),
      read: readJson,
      write: writeJson,
    }),
  };
  const pull = () =>
    callWeb(options, 'GET', '/api/v1/mastermind/fleet/answers?nonce=1');

  const first = await pull().catch((error) => error);
  assert.ok(isRateLimited(first));
  assert.equal(first.message, `${ANSWERS} 429`);
  const until = readJson(pauseFile(paths))[ANSWERS];
  assert.ok(until > Date.now() + 110_000 && until <= Date.now() + 120_000);

  const second = await pull().catch((error) => error);
  assert.ok(isRateLimited(second));
  assert.equal(second.message, `${ANSWERS} paused`);
  assert.deepEqual(web.calls, [ANSWERS]);

  // The acknowledgement and the other pull are separate routes.
  await callWeb(options, 'POST', '/api/v1/mastermind/fleet/answers', '{}');
  await callWeb(options, 'GET', '/api/v1/mastermind/fleet/alerts?nonce=2');
  assert.deepEqual(web.calls, [ANSWERS, ACKS, ALERTS]);
});

test('other refusals keep their status and record no pause', async () => {
  const paths = sandbox();
  const web = fakeWeb({ failing: { [STATE]: 503 } });
  const error = await callWeb(
    {
      fetchImpl: web.fetchImpl,
      origin: 'https://tuturuuu.com',
      secret: SECRET,
      sign: signRequest,
      tickEnd: Date.now() + 20_000,
      backoff: createWebBackoff({
        file: pauseFile(paths),
        read: readJson,
        write: writeJson,
      }),
    },
    'PUT',
    '/api/v1/mastermind/fleet/state',
    '{}'
  ).catch((caught) => caught);
  assert.equal(isRateLimited(error), false);
  assert.equal(error.message, `${STATE} 503`);
  assert.equal(fs.existsSync(pauseFile(paths)), false);
});

test('a rate-limited answers pull does not stop the run, and resumes after the pause', async () => {
  const paths = sandbox();
  const limited = fakeWeb({ limited: { [ANSWERS]: '86028' } });
  const first = await run(paths, limited);
  assert.equal(first.published, true);
  assert.equal(first.answers, 0);
  assert.deepEqual(first.rateLimited, ['answers']);
  assert.deepEqual(first.alerts, { firing: 0, pages: 0 });
  assert.deepEqual(limited.calls, [STATE, ANSWERS, ALERTS]);
  // A day-long Retry-After is held to the cap.
  const until = readJson(pauseFile(paths))[ANSWERS];
  assert.ok(until <= Date.now() + BACKOFF_MAX_MS);

  const open = fakeWeb({ answers: [ANSWER] });
  const paused = await run(paths, open, { force: true });
  assert.deepEqual(paused.rateLimited, ['answers']);
  assert.deepEqual(open.calls, [STATE, ALERTS]);

  writeJson(pauseFile(paths), { [ANSWERS]: Date.now() - 1 });
  const resumed = await run(paths, open, { force: true });
  assert.equal(resumed.rateLimited, undefined);
  assert.equal(resumed.answers, 1);
  assert.deepEqual(open.calls.slice(2), [STATE, ANSWERS, ACKS, ALERTS]);
  assert.ok(fs.existsSync(path.join(paths.answersDir, 'ship.r2.json')));
});

test('a rate-limited state publish stays due and still pulls answers', async () => {
  const paths = sandbox();
  const limited = fakeWeb({ limited: { [STATE]: '30' }, answers: [ANSWER] });
  const first = await run(paths, limited);
  assert.equal(first.published, false);
  assert.deepEqual(first.rateLimited, ['state']);
  assert.equal(first.answers, 1);
  assert.deepEqual(limited.calls, [STATE, ANSWERS, ACKS, ALERTS]);
  assert.equal(fs.existsSync(paths.stampFile), false);

  // Within the pause the snapshot is not sent; it is still due afterwards.
  const open = fakeWeb();
  const paused = await run(paths, open);
  assert.equal(paused.published, false);
  assert.deepEqual(paused.rateLimited, ['state']);
  assert.deepEqual(open.calls, [ANSWERS, ALERTS]);

  writeJson(pauseFile(paths), {});
  const resumed = await run(paths, open);
  assert.equal(resumed.published, true);
  assert.equal(resumed.rateLimited, undefined);
  assert.ok(fs.existsSync(paths.stampFile));
});

test('a rate limit on the v1 retry of a refused snapshot does not stop the run', async () => {
  const paths = sandbox();
  paths.releaseFile = path.join(paths.root, 'release.json');
  fs.writeFileSync(
    paths.releaseFile,
    JSON.stringify({ main: { state: 'frozen', reason: 'held' } })
  );
  const web = fakeWeb({ sequence: { [STATE]: [413, 429] }, answers: [ANSWER] });
  const result = await run(paths, web);
  assert.equal(result.published, false);
  assert.equal(result.degraded, false);
  assert.deepEqual(result.rateLimited, ['state']);
  assert.equal(result.answers, 1);
  assert.deepEqual(web.calls, [STATE, STATE, ANSWERS, ACKS, ALERTS]);
  assert.equal(fs.existsSync(paths.stampFile), false);
  assert.ok(readJson(pauseFile(paths))[STATE] > Date.now());

  // Any other refusal of the retry still fails the run.
  const failing = sandbox();
  failing.releaseFile = path.join(failing.root, 'release.json');
  fs.writeFileSync(
    failing.releaseFile,
    JSON.stringify({ main: { state: 'frozen', reason: 'held' } })
  );
  await assert.rejects(
    run(failing, fakeWeb({ sequence: { [STATE]: [413, 500] } })),
    new Error(`${STATE} 500`)
  );
});

test('a rate-limited alerts pull is reported as skipped', async () => {
  const paths = sandbox();
  const result = await run(paths, fakeWeb({ limited: { [ALERTS]: '60' } }));
  assert.deepEqual(result.alerts, { skipped: 'rate_limited' });
  assert.equal(result.rateLimited, undefined);
  assert.equal(fs.existsSync(paths.alertsFile), false);
});

test('a failing answers pull still fails the run', async () => {
  const paths = sandbox();
  await assert.rejects(
    run(paths, fakeWeb({ failing: { [ANSWERS]: 503 } })),
    new Error(`${ANSWERS} 503`)
  );
  assert.equal(fs.existsSync(pauseFile(paths)), false);
});
