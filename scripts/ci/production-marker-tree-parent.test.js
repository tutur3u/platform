const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const {
  workflow,
  productionSha: target,
  stagingSha: source,
} = require('./fixtures/production-migration-target-fixture.cjs');

const tree = 'e'.repeat(40);
const other = 'f'.repeat(40);
const base = '/repos/example/platform';
const workflowPath = '.github/workflows/supabase-staging.yaml';
const markerPath = 'scripts/ci/record-deployment-marker.ts';
const proof = workflow.split("<<'STAGING_SOURCE_PROOF'\n")[1];
const code = proof.slice(0, proof.indexOf('          main().catch('));

async function verify(options = {}) {
  const selected = options.exact ? target : source;
  const requests = [];
  const logs = [];
  const repository = {
    id: 101,
    full_name: 'example/platform',
    default_branch: 'main',
  };
  const producer = {
    id: 102,
    path: workflowPath,
    name: 'Supabase Staging Migration',
    state: 'active',
  };
  const runUrl = 'https://github.com/example/platform/actions/runs/201';
  const marker = {
    id: 301,
    sha: selected,
    ref: selected,
    environment: 'supabase-staging',
    created_at: '2026-01-01T00:01:00Z',
    payload: {
      sha: selected,
      markerKind: 'deployment',
      workflowName: 'supabase-staging.yaml',
      refName: 'main',
      ref: 'refs/heads/main',
      runId: '201',
      runAttempt: '1',
      runUrl,
    },
  };
  if (options.badMarker) marker.payload.refName = 'production';
  const run = {
    id: 201,
    workflow_id: 102,
    path: workflowPath,
    head_branch: 'main',
    head_sha: selected,
    repository,
    head_repository: repository,
    run_attempt: options.superseded ? 2 : 1,
    event: options.event || 'push',
    status: 'completed',
    conclusion: options.failed ? 'failure' : 'success',
  };
  const status = {
    id: 401,
    state: options.status || 'success',
    environment: 'supabase-staging',
    log_url: runUrl,
  };
  const commit = {
    sha: target,
    tree: { sha: tree },
    parents: options.notParent
      ? [{ sha: other }]
      : [{ sha: other }, { sha: source }],
  };
  const sourceCommit = {
    sha: source,
    tree: { sha: options.treeMismatch ? other : tree },
  };
  const times = {
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:01:00Z',
  };
  const job = {
    id: 501,
    name: 'Migrate staging database',
    run_id: 201,
    run_attempt: 1,
    head_sha: selected,
    status: 'completed',
    conclusion: 'success',
    ...times,
    steps: [
      'Check out migration target',
      'Deploy migrations to staging',
      'Record successful staging migration marker',
    ].map((name, index) => ({
      name,
      number: index + 1,
      status: 'completed',
      conclusion: options.skippedStep && index === 1 ? 'skipped' : 'success',
      ...times,
    })),
  };
  const replies = new Map([
    [base, repository],
    [`${base}/actions/workflows/supabase-staging.yaml`, producer],
    [`${base}/git/commits/${target}`, commit],
    [`${base}/git/commits/${source}`, sourceCommit],
    [
      `${base}/git/commits/${other}`,
      { ...sourceCommit, sha: other, tree: { sha: other } },
    ],
    [
      `${base}/compare/refs%2Fheads%2Fmain...${source}`,
      { status: options.relation || 'behind' },
    ],
    [
      `${base}/deployments?environment=supabase-staging&sha=${target}&per_page=100&page=1`,
      options.exact ? [marker] : [],
    ],
    [
      `${base}/deployments?environment=supabase-staging&sha=${source}&per_page=100&page=1`,
      options.missing ? [] : [marker],
    ],
    [`${base}/actions/runs/201`, run],
    [`${base}/deployments/301`, marker],
    [`${base}/deployments/301/statuses?per_page=1&page=1`, [status]],
    [
      `${base}/actions/runs/201/attempts/1/jobs?per_page=100&page=1`,
      { total_count: 1, jobs: [job] },
    ],
  ]);
  for (const file of [workflowPath, markerPath]) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file));
    const digest = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    replies.set(`${base}/contents/${file}?ref=${selected}`, {
      type: 'file',
      path: file,
      sha: options.unknownContract ? other : digest,
    });
    replies.set(`${base}/git/blobs/${digest}`, {
      sha: digest,
      encoding: 'base64',
      size: bytes.length,
      content: bytes.toString('base64'),
    });
  }
  let markerReads = 0;
  let statusReads = 0;
  let targetReads = 0;
  let compareReads = 0;
  const main = runInNewContext(`${code}\nmain`, {
    process: {
      env: {
        GITHUB_REPOSITORY: 'example/platform',
        TARGET_SHA: target,
        GH_TOKEN: 'synthetic',
      },
    },
    Buffer,
    URL,
    AbortSignal,
    crypto: webcrypto,
    console: { log: (line) => logs.push(line) },
    fetch: async (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.github.com');
      assert.equal(init.method, 'GET');
      const route = url.pathname + url.search;
      requests.push(route);
      assert.ok(replies.has(route), `unexpected request ${route}`);
      let data = replies.get(route);
      if (
        route === `${base}/git/commits/${target}` &&
        ++targetReads > 1 &&
        options.changedTree
      )
        data = { ...commit, tree: { sha: other } };
      if (
        route.includes('/compare/') &&
        ++compareReads > 1 &&
        options.changedMain
      )
        data = { status: 'diverged' };
      if (
        route.includes('/deployments?') &&
        route.includes(`sha=${selected}`) &&
        ++markerReads > 1 &&
        options.changedMarker
      )
        data = [{ ...marker, id: 302 }];
      if (
        route.includes('/statuses?') &&
        ++statusReads > 1 &&
        options.changedStatus
      )
        data = [{ ...status, state: 'inactive' }];
      if (options.apiFailure && route.includes('/compare/'))
        return new Response('{}', { status: 503 });
      return new Response(JSON.stringify(data), { status: 200 });
    },
  });
  try {
    await main();
    return { requests, logs };
  } catch (error) {
    assert.deepEqual(
      logs,
      [],
      'rejections must not log successful source proof'
    );
    throw error;
  }
}

test('exact-SHA path retains its proof and does not query parents or main', async () => {
  const { requests, logs } = await verify({ exact: true });
  assert.deepEqual(logs, [
    `Staging source proof: source=${target} producer=201 attempt=1 deployment=301`,
    `Production platform deployment marker and staging migration are bound to ${target}. Proceeding with migration.`,
  ]);
  assert.equal(requests.length, 14);
  assert.ok(
    requests.every(
      (route) =>
        !route.includes('/git/commits/') && !route.includes('/compare/')
    )
  );
});
for (const relation of ['identical', 'behind']) {
  test(`tree-equal direct parent ${relation} main with successful staging passes`, async () => {
    const { logs, requests } = await verify({ relation });
    assert.deepEqual(logs, [
      `Staging source proof: source=${source} target=${target} tree=${tree} producer=201 attempt=1 deployment=301`,
      `Production platform deployment marker is bound to ${target}; staging migration is bound to its tree-equal parent ${source}. Proceeding with migration.`,
    ]);
    assert.ok(
      requests.includes(`${base}/contents/${workflowPath}?ref=${source}`)
    );
    assert.ok(
      !requests.includes(`${base}/contents/${workflowPath}?ref=${target}`)
    );
    assert.equal(
      requests.filter((route) =>
        route.includes(`/compare/refs%2Fheads%2Fmain...${source}`)
      ).length,
      2
    );
  });
}
for (const [name, options, error] of [
  ['tree mismatch', { treeMismatch: true }, 'marker-missing'],
  ['source is not a direct parent', { notParent: true }, 'marker-missing'],
  ['source ahead of main', { relation: 'ahead' }, 'marker-missing'],
  ['source diverged from main', { relation: 'diverged' }, 'marker-missing'],
  ['unknown main relation', { relation: 'unknown' }, 'marker-missing'],
  ['no parent marker', { missing: true }, 'marker-missing'],
  [
    'superseded staging attempt',
    { superseded: true },
    'producer-current-attempt-contract',
  ],
  ['failed staging run', { failed: true }, 'producer-current-attempt-contract'],
  ['failed marker status', { status: 'failure' }, 'marker-latest-status'],
  ['superseded marker', { status: 'inactive' }, 'marker-latest-status'],
  ['marker contract violation', { badMarker: true }, 'marker-source-contract'],
  [
    'unknown source contract',
    { unknownContract: true },
    'unknown-producer-contract',
  ],
  [
    'manual direct producer',
    { event: 'workflow_dispatch' },
    'eligible-marker-missing',
  ],
  ['critical step skipped', { skippedStep: true }, 'migration-step-success'],
  [
    'marker selection changed',
    { changedMarker: true },
    'marker-selection-changed',
  ],
  ['marker status changed', { changedStatus: true }, 'marker-latest-status'],
  ['tree proof changed', { changedTree: true }, 'staging-source-tree'],
  ['main proof changed', { changedMain: true }, 'staging-source-main'],
  ['compare API failure', { apiFailure: true }, 'api-response'],
]) {
  test(`parent fallback rejects ${name}`, async () => {
    await assert.rejects(verify(options), new RegExp(error));
  });
}

test('an invalid exact marker blocks parent fallback', async () => {
  await assert.rejects(
    verify({ exact: true, badMarker: true }),
    /marker-source-contract/
  );
});
