import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signAttemptState } from './wave1-native-attempt.mjs';
import { profileFor } from './wave1-native-profile.mjs';
import { rollbackWeb } from './wave1-web-rollback.mjs';

const sha = 'f'.repeat(40);
const mine = '22222222-2222-2222-2222-222222222222';
const prior = '11111111-1111-1111-1111-111111111111';
const p = profileFor('web', 'staging');
const env = {
  CLOUDFLARE_STAGING_API_TOKEN: 'staging-fixture',
  CLOUDFLARE_STAGING_ACCOUNT_ID: p.accountId,
  WAVE1_STAGING_ATTEMPT_D1_ID: '33333333-3333-3333-3333-333333333333',
  GITHUB_REPOSITORY: 'fixture/repo',
};
const scope = {
  databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
  repository: env.GITHUB_REPOSITORY,
  app: 'web',
  worker: p.name,
  accountId: p.accountId,
};
const deployment = (id) => ({
  id: `dep-${id}`,
  versions: [{ version_id: id, percentage: 100 }],
});

function world({
  serving = mine,
  state = 'activated',
  acceptWrite = true,
} = {}) {
  const w = { serving, writes: [], urls: [] };
  const record = signAttemptState(
    {
      schema: 1,
      scope,
      entries: [
        {
          runId: '5',
          runAttempt: '1',
          state,
          versionId: mine,
          payload: { sha, digest: 'd'.repeat(64), rollback: deployment(prior) },
        },
      ],
    },
    env.CLOUDFLARE_STAGING_API_TOKEN
  );
  w.fetcher = async (url, init = {}) => {
    const u = new URL(url);
    w.urls.push(`${init.method} ${u.pathname}`);
    assert.equal(u.hostname, 'api.cloudflare.com');
    if (u.pathname.endsWith('/query')) {
      assert.match(
        JSON.parse(init.body).sql,
        /^SELECT/u,
        'the ledger is read-only here'
      );
      return Response.json({
        success: true,
        result: [{ success: true, results: [{ record }] }],
      });
    }
    assert.equal(
      u.pathname,
      `/client/v4/accounts/${p.accountId}/workers/scripts/${p.name}/deployments`,
      'Worker-scoped only'
    );
    if (init.method === 'POST') {
      w.writes.push(JSON.parse(init.body));
      if (acceptWrite) w.serving = JSON.parse(init.body).versions[0].version_id;
      return Response.json({ success: acceptWrite });
    }
    return Response.json({
      success: true,
      result: { deployments: [deployment(w.serving)] },
    });
  };
  return w;
}

test('rolls the staging Worker back to the captured prior version with one write', async () => {
  const w = world();
  assert.deepEqual(await rollbackWeb({ env, sha, fetcher: w.fetcher }), {
    worker: p.name,
    restored: [{ version_id: prior, percentage: 100 }],
  });
  assert.equal(w.writes.length, 1);
  assert.deepEqual(w.writes[0].versions, [
    { version_id: prior, percentage: 100 },
  ]);
  assert.equal(w.serving, prior);
});

for (const [label, options, message] of [
  [
    'a later or manual version is serving',
    { serving: '44444444-4444-4444-4444-444444444444' },
    /not what is serving/,
  ],
  ['the SHA never uploaded', { state: 'pending' }, /nothing to roll back/],
  [
    'Cloudflare refuses the deployment',
    { acceptWrite: false },
    /apply S1\/S1b/,
  ],
]) {
  test(`refuses or reports when ${label}`, async () => {
    const w = world(options);
    await assert.rejects(
      rollbackWeb({ env, sha, fetcher: w.fetcher }),
      message
    );
    assert.ok(w.writes.length <= 1);
    if (options.serving || options.state) assert.equal(w.writes.length, 0);
  });
}

test('a tampered or foreign ledger is refused before any write', async () => {
  const w = world();
  await assert.rejects(
    rollbackWeb({
      env: { ...env, GITHUB_REPOSITORY: 'other/repo' },
      sha,
      fetcher: w.fetcher,
    }),
    /scope/
  );
  await assert.rejects(
    rollbackWeb({
      env: { ...env, CLOUDFLARE_STAGING_API_TOKEN: 'other' },
      sha,
      fetcher: w.fetcher,
    }),
    /signature/
  );
  assert.equal(w.writes.length, 0);
});

for (const [label, patch, message] of [
  ['the D1 id is unset', { WAVE1_STAGING_ATTEMPT_D1_ID: undefined }, /D1/],
  ['the D1 id is empty', { WAVE1_STAGING_ATTEMPT_D1_ID: '' }, /D1/],
]) {
  test(`rollback refuses before any API call when ${label}`, async () => {
    const w = world();
    await assert.rejects(
      rollbackWeb({ env: { ...env, ...patch }, sha, fetcher: w.fetcher }),
      message
    );
    assert.deepEqual(w.urls, []);
    assert.equal(w.writes.length, 0);
  });
}
