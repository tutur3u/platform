// The publisher never overwrites a deployment it did not write: a hand
// hotfix or rollback between its own writes is recorded and left serving.
// Also covers recovery after an interrupted upload step and the time budget.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gateOrRollBack, healthGate } from './wave1-production-health.mjs';
import { recoverPublication } from './wave1-production-recovery.mjs';
import { stagedSmoke, stageSmokeSwitch } from './wave1-staged-publish.mjs';

const sha = 'a'.repeat(40);
const noSleep = async () => {};
const serving = [{ version_id: 'old', percentage: 100 }];
const stage = [...serving, { version_id: 'new', percentage: 0 }];
const switched = [{ version_id: 'new', percentage: 100 }];
const hotfix = [{ version_id: 'hotfix', percentage: 100 }];

function controlPlane(initial, { failWrite = () => false } = {}) {
  const state = { split: initial, writes: [] };
  const request = async (_url, _token, body) => {
    if (body) {
      state.writes.push(body.versions);
      if (failWrite(body.versions, state.writes.length))
        return { success: false, result: {} };
      state.split = body.versions;
      return { success: true, result: {} };
    }
    return {
      success: true,
      result: { deployments: [{ versions: state.split }] },
    };
  };
  return { state, request };
}

function appOf(url) {
  const { hostname, pathname } = new URL(url);
  return hostname === 'tuturuuu.com'
    ? pathname.split('/')[1]
    : hostname.split('.')[0];
}

// A healthy public edge; `onCall` can move the deployment mid-smoke.
function edge({ onCall = () => {}, status = 200, appName } = {}) {
  return async (url) => {
    onCall();
    if (new URL(url).pathname.endsWith('/api/build-info'))
      return status === 200
        ? Response.json({ commitHash: sha, appName: appName ?? appOf(url) })
        : new Response('x', { status });
    return new Response(null, {
      status: 307,
      headers: { location: 'https://tuturuuu.com/login' },
    });
  };
}

const record = (state = 'uploaded-version') => ({
  state,
  versionId: 'new',
  rollback: { id: 'd', versions: serving },
});

function run(plane, rec, smokeFetcher) {
  return stageSmokeSwitch({
    app: 'calendar',
    sha,
    worker: 'tuturuuu-calendar',
    record: rec,
    save: () => {},
    script: 'https://api.example/script',
    token: 'deploy',
    request: plane.request,
    cases: [],
    smokeFetcher,
    sleep: noSleep,
  });
}

test('a hand change between stage and switch is left serving', async () => {
  const plane = controlPlane(serving);
  const rec = record();
  await assert.rejects(
    run(
      plane,
      rec,
      edge({
        onCall: () => {
          plane.state.split = hotfix;
        },
      })
    ),
    /Switching traffic refused; another writer changed the deployment/
  );
  assert.equal(rec.state, 'concurrent-change');
  assert.deepEqual(rec.concurrent.active, hotfix);
  assert.deepEqual(plane.state.split, hotfix);
  assert.deepEqual(plane.state.writes, [stage]);
});

test('a hand change before staging is never overwritten', async () => {
  const plane = controlPlane(hotfix);
  const rec = record();
  await assert.rejects(
    run(plane, rec, edge()),
    /Staging at 0% refused; another writer changed the deployment/
  );
  assert.equal(rec.state, 'concurrent-change');
  assert.deepEqual(plane.state.writes, []);
});

test('a failed stage write leaves serving alone without another write', async () => {
  const plane = controlPlane(serving, { failWrite: () => true });
  const rec = record();
  await assert.rejects(
    run(plane, rec, edge()),
    /serving deployment is restored/
  );
  assert.equal(rec.state, 'stage-failed');
  assert.deepEqual(plane.state.writes, [stage]);
  assert.deepEqual(plane.state.split, serving);
});

test('a failed smoke restores serving only over its own stage', async () => {
  const plane = controlPlane(serving);
  const rec = record();
  await assert.rejects(
    run(plane, rec, edge({ status: 503 })),
    /no traffic moved/
  );
  assert.equal(rec.state, 'smoke-failed');
  assert.deepEqual(plane.state.writes, [stage, serving]);
});

test('a failed smoke after a hand change writes nothing more', async () => {
  const plane = controlPlane(serving);
  const rec = record();
  let calls = 0;
  await assert.rejects(
    run(
      plane,
      rec,
      edge({
        status: 503,
        onCall: () => {
          calls += 1;
          plane.state.split = hotfix;
        },
      })
    ),
    /another writer changed the deployment/
  );
  assert.ok(calls > 0);
  assert.equal(rec.state, 'concurrent-change');
  assert.deepEqual(plane.state.split, hotfix);
  assert.deepEqual(plane.state.writes, [stage]);
});

const failingGate = (onCall) =>
  gateOrRollBack({
    app: 'calendar',
    sha,
    record: gateRecord,
    save: () => {},
    script: 'https://api.example/script',
    token: 'deploy',
    request: gatePlane.request,
    healthFetcher: edge({ status: 500, onCall }),
    sleep: noSleep,
    options: { rounds: 1, propagationRounds: 1 },
  });
let gateRecord;
let gatePlane;

test('a failed health gate after a hand change rolls nothing back', async () => {
  gatePlane = controlPlane(switched);
  gateRecord = record('switched');
  await assert.rejects(
    failingGate(() => {
      gatePlane.state.split = hotfix;
    }),
    /another writer changed the deployment, so nothing was rolled back/
  );
  assert.equal(gateRecord.state, 'concurrent-change');
  assert.deepEqual(gatePlane.state.writes, []);
  assert.deepEqual(gatePlane.state.split, hotfix);
});

test('a failed health gate rolls back over its own switch', async () => {
  gatePlane = controlPlane(switched);
  gateRecord = record('switched');
  await assert.rejects(
    failingGate(() => {}),
    /rolled back to deployment d/
  );
  assert.equal(gateRecord.state, 'rolled-back');
  assert.deepEqual(gatePlane.state.writes, [serving]);
});

test('the smoke and the health gate stop at the time budget', async () => {
  let now = 0;
  const clock = () => now;
  const smoke = await stagedSmoke({
    app: 'calendar',
    sha,
    worker: 'w',
    versionId: 'v',
    fetcher: async (url) => {
      now = 10;
      return Response.json({ commitHash: 'b'.repeat(40), appName: appOf(url) });
    },
    sleep: noSleep,
    deadlineAt: 5,
    now: clock,
  });
  assert.match(smoke.failure, /time budget exhausted/);
  now = 0;
  const gate = await healthGate({
    app: 'calendar',
    expected: sha,
    fetcher: async (url) => {
      now = 10;
      return new URL(url).pathname.endsWith('/api/build-info')
        ? Response.json({ commitHash: 'b'.repeat(40), appName: appOf(url) })
        : new Response(null, { status: 307 });
    },
    sleep: noSleep,
    deadlineAt: 5,
    now: clock,
  });
  assert.match(gate.failure, /time budget exhausted/);
});

function recovery(state, active) {
  const dir = mkdtempSync(join(tmpdir(), 'wave1-recover-'));
  const env = {
    GITHUB_REF: 'refs/heads/production',
    PUBLICATION_ENVIRONMENT: 'wave1-calendar-production',
    GITHUB_SHA: sha,
    GITHUB_RUN_ID: '7',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_TEMP: dir,
    WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: 'deploy',
  };
  const path = join(dir, 'calendar-production-publication.json');
  if (state)
    writeFileSync(
      path,
      JSON.stringify({
        ...record(state),
        app: 'calendar',
        sha,
        worker: 'tuturuuu-calendar',
        runId: '7',
        runAttempt: '1',
      })
    );
  const plane = controlPlane(active);
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer deploy');
    const body = options.body ? JSON.parse(options.body) : undefined;
    return Response.json(await plane.request(url, 'deploy', body));
  };
  return {
    plane,
    receipt: () => JSON.parse(readFileSync(path, 'utf8')),
    run: (extra = {}) =>
      recoverPublication({
        app: 'calendar',
        sha,
        env: { ...env, ...extra },
        accountId: 'a'.repeat(32),
        fetcher,
        sleep: noSleep,
      }),
  };
}

for (const [state, active] of [
  ['switched', switched],
  ['staged', stage],
  ['rolling-back', switched],
]) {
  test(`recovery restores the rollback after an interrupted ${state} upload`, async () => {
    const r = recovery(state, active);
    const result = await r.run();
    assert.equal(result.state, 'rolled-back');
    assert.equal(result.rollbackResult.by, 'recovery');
    assert.deepEqual(r.plane.state.split, serving);
    assert.equal(r.receipt().state, 'rolled-back');
  });
}

test('recovery never overwrites a hand change', async () => {
  const r = recovery('switched', hotfix);
  await assert.rejects(
    r.run(),
    /another writer's deployment; nothing was written/
  );
  assert.deepEqual(r.plane.state.writes, []);
  assert.equal(r.receipt().state, 'concurrent-change');
});

test('recovery leaves finished, refused and missing receipts alone', async () => {
  for (const state of ['healthy', 'pending', 'smoke-failed', 'rolled-back']) {
    const r = recovery(state, switched);
    assert.equal((await r.run()).state, state);
    assert.deepEqual(r.plane.state.writes, []);
  }
  assert.equal((await recovery(null, switched).run()).state, 'no-receipt');
});

test('recovery holds only the deploy credential', async () => {
  for (const extra of [
    { WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN: 'read' },
    { GITHUB_TOKEN: 'gh' },
    { WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: '' },
  ])
    await assert.rejects(recovery('switched', switched).run(extra));
});
