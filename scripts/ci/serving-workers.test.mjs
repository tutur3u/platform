import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SERVING_WORKERS,
  admission,
  buildCommit,
  compareProbe,
  htmlAssets,
  plan,
  publish,
  sameVersions,
  sourceDecision,
  withRetry,
} from './serving-workers.mjs';

const SHA = 'a'.repeat(40);
const LIVE = 'b'.repeat(40);
const SERVING = '11111111-1111-4111-8111-111111111111';
const CANDIDATE = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ENABLED = {
  SERVING_WORKERS_PUBLICATION: 'enabled',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ACCOUNT_ID: 'account',
};
const noSleep = async () => {};

test('the stop fence, credentials and policy each stop publication', () => {
  assert.equal(admission('learn', ENABLED, undefined), undefined);
  assert.match(
    admission('learn', { ...ENABLED, SERVING_WORKERS_PUBLICATION: 'disabled' }),
    /not enabled/
  );
  assert.match(
    admission('learn', { ...ENABLED, CLOUDFLARE_API_TOKEN: '' }),
    /credentials/
  );
  assert.match(admission('learn', ENABLED, 'held: review'), /held: review/);
});

test('publication only fast-forwards the live build', () => {
  assert.equal(sourceDecision(SHA, SHA, () => true).action, 'skip');
  assert.equal(sourceDecision(LIVE, SHA, () => true).action, 'publish');
  assert.equal(sourceDecision(LIVE, SHA, () => false).action, 'refuse');
  assert.equal(sourceDecision(null, SHA, () => true).action, 'refuse');
});

test('parsing helpers read HTML, build-info and deployments', () => {
  assert.deepEqual(
    htmlAssets(
      '<link href="/learn/assets/a.css"><script src="/learn/assets/b.js"></script><a href="/x">'
    ),
    ['/learn/assets/a.css', '/learn/assets/b.js']
  );
  assert.equal(buildCommit(JSON.stringify({ commit: SHA })), SHA);
  assert.equal(buildCommit('<html>'), null);
  const a = { version_id: SERVING, percentage: 100 };
  const b = { version_id: CANDIDATE, percentage: 0 };
  assert.ok(sameVersions([a, b], [b, a]));
  assert.ok(!sameVersions([a], [a, b]));
});

test('probe comparison requires the serving status and redirect', () => {
  assert.equal(compareProbe({ status: 200 }, { status: 200 }), undefined);
  assert.match(compareProbe({ status: 404 }, { status: 200 }), /differs/);
  assert.match(
    compareProbe(
      { status: 307, location: '/a' },
      { status: 307, location: '/b' }
    ),
    /redirect/
  );
  assert.match(compareProbe({ status: 503 }, { status: 503 }), /candidate 503/);
});

test('retries are bounded', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error('down');
      },
      { attempts: 3, sleep: noSleep }
    ),
    /down/
  );
  assert.equal(calls, 3);
});

test('every serving worker declares an artifact, archive and mount origin', () => {
  for (const [app, config] of Object.entries(SERVING_WORKERS)) {
    assert.equal(config.worker, `tuturuuu-${app}`);
    assert.match(config.artifact(SHA), new RegExp(SHA));
    assert.ok(config.origins.includes(`https://tuturuuu.com/${app}`), app);
  }
});

test('plan lists every app whose public build is not the source', async () => {
  const fetchImpl = async (url) =>
    new Response(
      JSON.stringify({ commitHash: url.includes('learn') ? SHA : LIVE })
    );
  const stale = await plan(SHA, { fetchImpl, sleep: noSleep });
  assert.deepEqual(
    stale.sort(),
    Object.keys(SERVING_WORKERS)
      .filter((app) => app !== 'learn')
      .sort()
  );
});

/** A fake Cloudflare account, public edge and cf publisher for one Worker. */
function harness({
  smokeStatus = 200,
  smokeThrows = false,
  assignThrows = false,
  otherWriter = false,
  stageFails = false,
  overrideLag = 0,
  crons = [],
  liveCrons = crons,
} = {}) {
  const state = {
    deployment: {
      id: 'd0',
      versions: [{ version_id: SERVING, percentage: 100 }],
    },
    n: 0,
    lag: 0,
    writes: [],
  };
  const out = mkdtempSync(path.join(tmpdir(), 'serving-workers-test-'));
  writeFileSync(
    path.join(out, 'serving-schedules.json'),
    JSON.stringify({ crons })
  );
  const setDeployment = (versions) => {
    state.n += 1;
    state.deployment = { id: `d${state.n}`, versions };
    state.writes.push(versions);
    return state.deployment;
  };
  const fetchImpl = async (url, init = {}) => {
    const json = (result) =>
      new Response(JSON.stringify({ success: true, result }));
    if (url.includes('/schedules'))
      return json({ schedules: liveCrons.map((cron) => ({ cron })) });
    if (url.includes('/deployments')) {
      if (init.method === 'POST') {
        const versions = JSON.parse(init.body).versions;
        if (stageFails && versions.length === 2) {
          setDeployment(versions);
          return new Response('', { status: 503 });
        }
        return json(setDeployment(versions));
      }
      return json({ deployments: [state.deployment] });
    }
    const override = init.headers?.['Cloudflare-Workers-Version-Overrides'];
    if (override && smokeThrows) throw new Error('edge unreachable');
    const active = state.deployment.versions.find(
      (v) => v.percentage === 100
    ).version_id;
    if (url.endsWith('/api/build-info')) {
      const lagging = override && state.lag++ < overrideLag;
      const serves = override && !lagging ? CANDIDATE : active;
      return new Response(
        JSON.stringify({ commitHash: serves === CANDIDATE ? SHA : LIVE })
      );
    }
    if (url.endsWith('.js') || url.endsWith('.css'))
      return new Response('', { status: 200 });
    return new Response('<script src="/learn/assets/app.js"></script>', {
      status: override ? smokeStatus : 200,
    });
  };
  const exec = (command, args) => {
    assert.equal(command, 'node');
    assert.equal(args[0], 'scripts/ci/void-cf-publisher.mjs');
    if (args[1] === 'publish')
      return `${JSON.stringify({ versionId: CANDIDATE, previousVersionId: SERVING })}\n`;
    assert.equal(args[1], 'assign');
    assert.equal(args[args.indexOf('--expect-current') + 1], SERVING);
    setDeployment([
      { version_id: otherWriter ? OTHER : CANDIDATE, percentage: 100 },
    ]);
    if (assignThrows) throw new Error('did not serve');
    return JSON.stringify({ servedAfter: SHA });
  };
  return {
    state,
    out,
    options: {
      env: ENABLED,
      fetchImpl,
      exec,
      isAncestor: () => true,
      sleep: noSleep,
    },
  };
}

const servingOnly = [{ version_id: SERVING, percentage: 100 }];

test('publish stages at 0%, smokes, then assigns 100% with expect-current', async () => {
  const { state, out, options } = harness();
  const receipt = await publish('learn', SHA, out, options);
  assert.equal(receipt.outcome, 'published');
  assert.equal(receipt.rollbackVersion, SERVING);
  assert.deepEqual(state.writes, [
    [
      { version_id: SERVING, percentage: 100 },
      { version_id: CANDIDATE, percentage: 0 },
    ],
    servingOnly,
    [{ version_id: CANDIDATE, percentage: 100 }],
  ]);
});

test('a smoke mismatch unstages the candidate', async () => {
  const { state, out, options } = harness({ smokeStatus: 500 });
  await assert.rejects(publish('learn', SHA, out, options), /smoke failed/);
  assert.deepEqual(state.deployment.versions, servingOnly);
});

test('a smoke exception still unstages the candidate', async () => {
  const { state, out, options } = harness({ smokeThrows: true });
  await assert.rejects(publish('learn', SHA, out, options), /edge unreachable/);
  assert.deepEqual(state.deployment.versions, servingOnly);
});

test('a failed assignment restores the captured serving version', async () => {
  const { state, out, options } = harness({ assignThrows: true });
  await assert.rejects(publish('learn', SHA, out, options), /did not serve/);
  assert.deepEqual(state.deployment.versions, servingOnly);
});

test('cron triggers must already match the live schedules', async () => {
  const { state, out, options } = harness({
    crons: ['17 * * * *'],
    liveCrons: [],
  });
  await assert.rejects(publish('roadmap', SHA, out, options), /schedules/);
  assert.equal(state.writes.length, 0);
});

test('a live build already at the source is recorded as current', async () => {
  const { state, out, options } = harness();
  const fetchImpl = options.fetchImpl;
  const receipt = await publish('learn', SHA, out, {
    ...options,
    fetchImpl: async (url, init) =>
      url.endsWith('/api/build-info')
        ? new Response(JSON.stringify({ commitHash: SHA }))
        : fetchImpl(url, init),
  });
  assert.equal(receipt.outcome, 'current');
  assert.equal(state.writes.length, 0);
});

test('a disabled stop fence makes no Cloudflare call', async () => {
  const { state, out, options } = harness();
  await assert.rejects(
    publish('learn', SHA, out, {
      ...options,
      env: { ...ENABLED, SERVING_WORKERS_PUBLICATION: '' },
    }),
    /not enabled/
  );
  assert.equal(state.writes.length, 0);
});

test('the smoke waits for the override to reach the staged candidate', async () => {
  const { state, out, options } = harness({ overrideLag: 2 });
  const receipt = await publish('learn', SHA, out, options);
  assert.equal(receipt.outcome, 'published');
  assert.ok(state.lag >= 3);
});

test('a stage write whose response fails is still unstaged', async () => {
  const { state, out, options } = harness({ stageFails: true });
  await assert.rejects(publish('learn', SHA, out, options), /Cloudflare 503/);
  assert.deepEqual(state.deployment.versions, servingOnly);
});

test('a failed assignment never overwrites another writer', async () => {
  const { state, out, options } = harness({
    assignThrows: true,
    otherWriter: true,
  });
  await assert.rejects(publish('learn', SHA, out, options), /did not serve/);
  assert.deepEqual(state.deployment.versions, [
    { version_id: OTHER, percentage: 100 },
  ]);
});
