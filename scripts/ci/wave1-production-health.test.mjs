import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HEALTH_TARGETS, healthGate } from './wave1-production-health.mjs';
import { stagedSmoke, stageSmokeSwitch } from './wave1-staged-publish.mjs';
import {
  provenLiveSha,
  supersedingSha,
} from './wave1-production-supersede.mjs';

const sha = 'a'.repeat(40);
const older = 'b'.repeat(40);
const profiles = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
);
const noSleep = async () => {};

// The app a public URL reaches: <app>.tuturuuu.com or tuturuuu.com/<app>.
function appOf(url) {
  const { hostname, pathname } = new URL(url);
  return hostname === 'tuturuuu.com'
    ? pathname.split('/')[1]
    : hostname.split('.')[0];
}

// A public edge whose answers come from `answer(url, call)`.
function edge(answer) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const result = answer(url, calls.length);
    if (result === 'timeout') {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    }
    if (typeof result === 'number')
      return new Response('x', { status: result });
    if (typeof result === 'string')
      return Response.json({ commitHash: result, appName: appOf(url) });
    return new Response(null, {
      status: result.status,
      headers: result.location ? { location: result.location } : {},
    });
  };
  return { fetcher, calls };
}

const healthy = (commit) =>
  edge((url) =>
    url.includes('/api/build-info')
      ? commit
      : { status: 307, location: 'https://tuturuuu.com/login' }
  );

test('every wave-1 app probes its canonical host first', () => {
  for (const [app, targets] of Object.entries(HEALTH_TARGETS)) {
    assert.ok(profiles.apps[app], app);
    assert.equal(
      targets.buildInfo[0],
      `https://${profiles.apps[app].canonicalHost}`
    );
  }
});

test('the gate passes after consecutive healthy rounds', async () => {
  const { fetcher } = healthy(sha);
  const gate = await healthGate({
    app: 'mail',
    expected: sha,
    fetcher,
    sleep: noSleep,
    rounds: 3,
  });
  assert.equal(gate.healthy, true);
  assert.equal(gate.probes.length, 3);
});

test('the previous commit may answer only while the new version propagates', async () => {
  let round = 0;
  const { fetcher } = edge((url) => {
    if (!url.includes('/api/build-info'))
      return { status: 307, location: 'https://tuturuuu.com/login' };
    round = Number(new URL(url).searchParams.get('ttr-health'));
    return round < 2 ? older : sha;
  });
  const gate = await healthGate({
    app: 'mail',
    expected: sha,
    fetcher,
    sleep: noSleep,
    rounds: 2,
    propagationRounds: 3,
  });
  assert.equal(gate.healthy, true);
  assert.equal(round, 3);
});

for (const [name, answer, message] of [
  ['a 5xx', (url) => (url.includes('/login') ? 502 : sha), /answered 502/],
  ['a timeout', (url) => (url.includes('/login') ? 'timeout' : sha), /timeout/],
  ['a stale commit', () => older, /reports b{40}, expected a{40}/],
  [
    'build-info without a commit',
    (url) => (url.includes('/api/build-info') ? { status: 200 } : 307),
    /reported no commit/,
  ],
]) {
  test(`the gate fails on ${name}`, async () => {
    const { fetcher } = edge(answer);
    const gate = await healthGate({
      app: 'mail',
      expected: sha,
      fetcher,
      sleep: noSleep,
      rounds: 2,
      propagationRounds: 2,
    });
    assert.equal(gate.healthy, false);
    assert.match(gate.failure, message);
  });
}

test('a commit that regresses after matching fails at once', async () => {
  const { fetcher } = edge((url) => {
    if (!url.includes('/api/build-info')) return 307;
    return Number(new URL(url).searchParams.get('ttr-health')) === 0
      ? sha
      : older;
  });
  const gate = await healthGate({
    app: 'mail',
    expected: sha,
    fetcher,
    sleep: noSleep,
    rounds: 3,
    propagationRounds: 5,
  });
  assert.equal(gate.healthy, false);
  assert.equal(gate.probes.length, 2);
});

test('the staged smoke checks release-recipe cases through the override', async () => {
  const cases = profiles.apps.calendar.releaseRecipe.smokeSpec.cases;
  const pass = await stagedSmoke({
    app: 'calendar',
    sha,
    worker: 'tuturuuu-calendar',
    versionId: 'v',
    cases,
    fetcher: healthy(sha).fetcher,
    sleep: noSleep,
  });
  assert.equal(pass.passed, true);
  const elsewhere = await stagedSmoke({
    app: 'calendar',
    sha,
    worker: 'tuturuuu-calendar',
    versionId: 'v',
    cases,
    fetcher: edge((url) =>
      url.includes('/api/build-info')
        ? sha
        : { status: 307, location: 'https://evil.example/x' }
    ).fetcher,
    sleep: noSleep,
  });
  assert.equal(elsewhere.passed, false);
  assert.match(elsewhere.failure, /expected https:\/\/tuturuuu\.com/);
  const wrongStatus = await stagedSmoke({
    app: 'calendar',
    sha,
    worker: 'tuturuuu-calendar',
    versionId: 'v',
    cases,
    fetcher: edge((url) => (url.includes('/api/build-info') ? sha : 200))
      .fetcher,
    sleep: noSleep,
  });
  assert.match(wrongStatus.failure, /answered 200, expected 307/);
});

function controlPlane(initial) {
  const state = { split: initial, writes: [] };
  const request = async (url, _token, body) => {
    if (body) {
      state.writes.push(body.versions);
      state.split = body.versions;
      state.onWrite?.(state);
      return { success: true, result: {} };
    }
    return {
      success: true,
      result: { deployments: [{ versions: state.split }] },
    };
  };
  return { state, request };
}

const baseRecord = () => ({
  state: 'uploaded-version',
  versionId: 'new',
  rollback: { id: 'd', versions: [{ version_id: 'old', percentage: 100 }] },
});

test('a split serving deployment is refused before any write', async () => {
  const { state, request } = controlPlane([]);
  const record = baseRecord();
  record.rollback.versions = [
    { version_id: 'old', percentage: 50 },
    { version_id: 'other', percentage: 50 },
  ];
  await assert.rejects(
    stageSmokeSwitch({
      app: 'calendar',
      sha,
      worker: 'tuturuuu-calendar',
      record,
      save: () => {},
      script: 'https://api.example/script',
      token: 'deploy',
      request,
      cases: [],
      sleep: noSleep,
    }),
    /one version serving 100%/
  );
  assert.deepEqual(state.writes, []);
});

const deployment = (versions) => ({ versions });
const compare = (status) => async () => Response.json({ status });
const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };

test('the serving SHA must be proven, never assumed', async () => {
  const readVersion = async () => ({ annotations: {} });
  await assert.rejects(
    provenLiveSha({
      deployment: deployment([
        { version_id: 'x', percentage: 90 },
        { version_id: 'y', percentage: 10 },
      ]),
      readVersion,
    }),
    /split across versions/
  );
  await assert.rejects(
    provenLiveSha({
      deployment: deployment([{ version_id: 'x', percentage: 100 }]),
      readVersion,
    }),
    /no source SHA and no accepted receipt/
  );
  assert.equal(
    await provenLiveSha({
      deployment: deployment([{ version_id: 'x', percentage: 100 }]),
      readVersion,
      baseline: { versionId: 'x', sha: older },
    }),
    older
  );
  await assert.rejects(
    provenLiveSha({
      deployment: deployment([{ version_id: 'x', percentage: 100 }]),
      readVersion,
      baseline: { versionId: 'other', sha: older },
    }),
    /no accepted receipt/
  );
});

test('a newer serving SHA supersedes; an older one proceeds; diverged refuses', async () => {
  const input = (status) => ({
    env,
    sha,
    deployment: deployment([{ version_id: 'x', percentage: 100 }]),
    readVersion: async () => ({ annotations: { 'workers/message': older } }),
    fetcher: compare(status),
  });
  assert.deepEqual(await supersedingSha(input('ahead')), {
    live: older,
    newer: older,
  });
  assert.deepEqual(await supersedingSha(input('behind')), {
    live: older,
    newer: null,
  });
  await assert.rejects(supersedingSha(input('diverged')), /production history/);
});

// A staged Finance edge: build-info JSON with headers, mount 307 to login.
function financeEdge({ buildInfo = {}, mount = {} } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const { pathname } = new URL(url);
    if (pathname.endsWith('/api/build-info')) {
      if (buildInfo.status && buildInfo.status !== 200)
        return new Response('secret-body-token', {
          status: buildInfo.status,
          headers: { 'cf-ray': 'ray-1', 'set-cookie': 'session=secret' },
        });
      return new Response(
        JSON.stringify({
          commitHash: buildInfo.commit ?? sha,
          appName: buildInfo.appName ?? 'finance',
          secret: 'x',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            ...(buildInfo.runtime === null
              ? {}
              : { 'x-tuturuuu-runtime': buildInfo.runtime ?? 'native' }),
          },
        }
      );
    }
    if (pathname === '/finance')
      return new Response(null, {
        status: mount.status ?? 307,
        headers: {
          location:
            mount.location ??
            'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Ftuturuuu.com%2Ffinance',
        },
      });
    return new Response(null, {
      status: 307,
      headers: { location: 'https://tuturuuu.com/login' },
    });
  };
  return { fetcher, calls };
}

const smokeFinance = (edgeFetch) =>
  stagedSmoke({
    app: 'finance',
    sha,
    worker: 'tuturuuu-finance',
    versionId: 'staged',
    cases: profiles.apps.finance.releaseRecipe.smokeSpec.cases,
    fetcher: edgeFetch.fetcher,
    sleep: noSleep,
    reachAttempts: 2,
  });

test('smoke contract: a healthy staged version passes on host and mount', async () => {
  const edgeFetch = financeEdge();
  const smoke = await smokeFinance(edgeFetch);
  assert.equal(smoke.passed, true, smoke.failure);
  const urls = edgeFetch.calls.map(({ url }) => url);
  assert.ok(urls.includes('https://finance.tuturuuu.com/api/build-info'));
  assert.ok(urls.includes('https://tuturuuu.com/finance/api/build-info'));
  assert.ok(urls.includes('https://tuturuuu.com/finance'));
  for (const { options } of edgeFetch.calls)
    assert.equal(
      options.headers['Cloudflare-Workers-Version-Overrides'],
      'tuturuuu-finance="staged"'
    );
});

test('smoke contract: a 5xx on build-info fails and keeps status and headers, never the body', async () => {
  const smoke = await smokeFinance(financeEdge({ buildInfo: { status: 503 } }));
  assert.equal(smoke.passed, false);
  assert.match(smoke.failure, /answered 503/);
  const record = JSON.stringify(smoke.observations);
  assert.match(record, /"status":503/);
  assert.match(record, /"cf-ray":"ray-1"/);
  assert.doesNotMatch(record, /secret-body-token|session=secret|set-cookie/);
});

test('smoke contract: a wrong commit never reaches the staged version', async () => {
  const smoke = await smokeFinance(
    financeEdge({ buildInfo: { commit: older } })
  );
  assert.equal(smoke.passed, false);
  assert.match(smoke.failure, /never reached staged version staged/);
});

test('smoke contract: a missing runtime header fails where the app emits it', async () => {
  const smoke = await smokeFinance(
    financeEdge({ buildInfo: { runtime: null } })
  );
  assert.equal(smoke.passed, false);
  assert.match(smoke.failure, /x-tuturuuu-runtime missing, expected native/);
});

test('smoke contract: the signed-out mount must redirect into login', async () => {
  const smoke = await smokeFinance(
    financeEdge({ mount: { location: 'https://tuturuuu.com/finance/home' } })
  );
  assert.equal(smoke.passed, false);
  assert.match(smoke.failure, /expected https:\/\/tuturuuu\.com\/login/);
});

test('runtimeHeader matches the apps whose start-bridge config sets the header', () => {
  for (const [app, targets] of Object.entries(HEALTH_TARGETS)) {
    let source = '';
    try {
      source = readFileSync(
        new URL(`../../apps/${app}/start-bridge.config.ts`, import.meta.url),
        'utf8'
      );
    } catch {}
    assert.equal(
      targets.runtimeHeader,
      /x-tuturuuu-runtime['"],\s*['"]native/.test(source),
      `${app}: update runtimeHeader when its source starts emitting the header`
    );
  }
});
