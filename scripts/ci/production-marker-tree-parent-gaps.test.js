// Gap tests for the tree-equal parent staging marker (#7462), mapped to the
// trunk-sync rules: (1) exact path unchanged, (2) source is a direct parent on
// main with an equal tree, (3) every marker check reruns with the source,
// (4) the production platform marker and migration stay bound to the target.
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const {
  workflow,
  productionSha: target,
  stagingSha: first,
} = require('./fixtures/production-migration-target-fixture.cjs');

const second = 'd'.repeat(40);
const producerHead = '9'.repeat(40);
const tree = 'e'.repeat(40);
const other = 'f'.repeat(40);
const base = '/repos/example/platform';
const workflowPath = '.github/workflows/supabase-staging.yaml';
const markerPath = 'scripts/ci/record-deployment-marker.ts';
const proof = workflow.split("<<'STAGING_SOURCE_PROOF'\n")[1];
const code = proof.slice(0, proof.indexOf('          main().catch('));

function blob(file) {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file));
  const sha = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  return { sha, bytes };
}

// world.markers: sha -> marker options; any sha without an entry has none.
async function verify(world) {
  const parents = world.parents ?? [other, first];
  const trees = {
    [target]: tree,
    [first]: tree,
    [second]: tree,
    [other]: other,
    ...world.trees,
  };
  const relation = { [first]: 'behind', [second]: 'behind', ...world.relation };
  const markers = world.markers ?? { [first]: {} };
  const repository = {
    id: 101,
    full_name: 'example/platform',
    default_branch: 'main',
  };
  const replies = new Map([
    [base, repository],
    [
      `${base}/actions/workflows/supabase-staging.yaml`,
      {
        id: 102,
        path: workflowPath,
        name: 'Supabase Staging Migration',
        state: 'active',
      },
    ],
    [
      `${base}/git/commits/${target}`,
      {
        sha: world.targetSha ?? target,
        tree: { sha: tree },
        parents: parents.map((sha) => ({ sha })),
      },
    ],
  ]);
  for (const sha of [first, second, other])
    replies.set(`${base}/git/commits/${sha}`, {
      sha,
      tree: { sha: trees[sha] },
    });
  for (const [sha, status] of Object.entries(relation))
    replies.set(`${base}/compare/refs%2Fheads%2Fmain...${sha}`, { status });
  const current = blob(workflowPath);
  const legacy = blob('scripts/ci/fixtures/supabase-staging-legacy.yaml');
  const recorder = blob(markerPath);
  for (const b of [current, legacy, recorder])
    replies.set(`${base}/git/blobs/${b.sha}`, {
      sha: b.sha,
      encoding: 'base64',
      size: b.bytes.length,
      content: b.bytes.toString('base64'),
    });
  const contents = (ref, wf) => {
    replies.set(`${base}/contents/${workflowPath}?ref=${ref}`, {
      type: 'file',
      path: workflowPath,
      sha: wf.sha,
    });
    replies.set(`${base}/contents/${markerPath}?ref=${ref}`, {
      type: 'file',
      path: markerPath,
      sha: recorder.sha,
    });
  };
  for (const sha of [target, first, second]) {
    const m = markers[sha];
    replies.set(
      `${base}/deployments?environment=supabase-staging&sha=${sha}&per_page=100&page=1`,
      []
    );
    contents(sha, current);
    if (!m) continue;
    const n = sha === target ? 1 : sha === first ? 2 : 3;
    const runUrl = `https://github.com/example/platform/actions/runs/20${n}`;
    const marker = {
      id: 300 + n,
      sha,
      ref: sha,
      environment: 'supabase-staging',
      created_at: '2026-01-01T00:01:00Z',
      payload: {
        sha,
        markerKind: 'deployment',
        workflowName: 'supabase-staging.yaml',
        refName: 'main',
        ref: 'refs/heads/main',
        runId: `20${n}`,
        runAttempt: '1',
        runUrl,
      },
    };
    const head = m.runHead ?? sha;
    const times = {
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:01:00Z',
    };
    replies.set(
      `${base}/deployments?environment=supabase-staging&sha=${sha}&per_page=100&page=1`,
      [marker]
    );
    replies.set(`${base}/deployments/${marker.id}`, marker);
    replies.set(`${base}/deployments/${marker.id}/statuses?per_page=1&page=1`, [
      {
        id: 400 + n,
        state: m.status ?? 'success',
        environment: 'supabase-staging',
        log_url: runUrl,
      },
    ]);
    replies.set(`${base}/actions/runs/20${n}`, {
      id: 200 + n,
      workflow_id: 102,
      path: workflowPath,
      head_branch: 'main',
      head_sha: head,
      repository,
      head_repository: repository,
      run_attempt: 1,
      event: m.event ?? 'push',
      status: 'completed',
      conclusion: m.conclusion ?? 'success',
    });
    replies.set(
      `${base}/actions/runs/20${n}/attempts/1/jobs?per_page=100&page=1`,
      {
        total_count: 1,
        jobs: [
          {
            id: 500 + n,
            name: 'Migrate staging database',
            run_id: 200 + n,
            run_attempt: 1,
            head_sha: m.jobHead ?? head,
            status: 'completed',
            conclusion: 'success',
            ...times,
            steps: [
              'Check out migration target',
              'Deploy migrations to staging',
              'Record successful staging migration marker',
            ].map((name, i) => ({
              name,
              number: i + 1,
              status: 'completed',
              conclusion: 'success',
              ...times,
            })),
          },
        ],
      }
    );
    if (head !== sha) contents(head, legacy);
  }
  const requests = [];
  const logs = [];
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
      assert.equal(init.method, 'GET');
      const route = url.pathname + url.search;
      requests.push(route);
      assert.ok(replies.has(route), `unexpected request ${route}`);
      const seen = requests.filter((r) => r === route).length;
      const data =
        world.reread && seen > 1
          ? world.reread(route, replies.get(route))
          : replies.get(route);
      return new Response(JSON.stringify(data), { status: 200 });
    },
  });
  try {
    await main();
  } catch (error) {
    assert.deepEqual(logs, [], 'rejections must not log a source proof');
    error.requests = requests;
    throw error;
  }
  return { requests, logs };
}

const fallbackLog = (source) =>
  `Staging source proof: source=${source} target=${target} tree=${tree}`;
const count = (requests, text) =>
  requests.filter((route) => route.includes(text)).length;

test('rule 1: a failed exact marker blocks fallback even with a valid parent', async () => {
  for (const exact of [{ status: 'failure' }, { conclusion: 'failure' }]) {
    const error = await verify({
      markers: { [target]: exact, [first]: {} },
    }).catch((e) => e);
    assert.match(
      error.message,
      /marker-latest-status|producer-current-attempt-contract/
    );
    assert.equal(
      count(error.requests, '/git/commits/') +
        count(error.requests, '/compare/'),
      0
    );
  }
});

test('rule 2: a qualifying parent without a marker is skipped for the next', async () => {
  const { logs, requests } = await verify({ parents: [second, first] });
  assert.deepEqual(logs, [fallbackLog(first)]);
  assert.equal(count(requests, `/compare/refs%2Fheads%2Fmain...${second}`), 1);
  assert.equal(count(requests, `sha=${second}&`), 1);
});

test('rule 2: the first qualifying parent with markers wins, in parent order', async () => {
  const world = {
    parents: [second, first],
    markers: { [first]: {}, [second]: {} },
  };
  assert.deepEqual((await verify(world)).logs, [fallbackLog(second)]);
  const failed = {
    ...world,
    markers: { [first]: {}, [second]: { status: 'failure' } },
  };
  await assert.rejects(verify(failed), /marker-latest-status/);
});

for (const [name, world] of [
  ['a root target', { parents: [] }],
  ['more than eight parents', { parents: Array(9).fill(first) }],
  ['a malformed parent sha', { parents: ['xyz'] }],
  ['a target commit for another sha', { targetSha: other }],
]) {
  test(`rule 2: fallback rejects ${name}`, async () => {
    await assert.rejects(verify(world), /target-commit/);
  });
}

test('rule 3: markers are re-read at the source, never at the target', async () => {
  const { requests } = await verify({});
  assert.equal(
    count(requests, `deployments?environment=supabase-staging&sha=${target}&`),
    1
  );
  assert.equal(
    count(requests, `deployments?environment=supabase-staging&sha=${first}&`),
    2
  );
  assert.equal(count(requests, `/git/commits/${target}`), 2);
  assert.equal(count(requests, `?ref=${target}`), 0);
});

test('rule 3: the final re-check rejects a target whose parents no longer include the source', async () => {
  const reread = (route, data) =>
    route === `${base}/git/commits/${target}`
      ? { ...data, parents: [{ sha: other }] }
      : data;
  await assert.rejects(verify({ reread }), /staging-source-tree/);
});

for (const [name, marker, error] of [
  ['push run for another head', { runHead: other }, 'direct-source'],
  [
    'manual run for another head',
    { runHead: other, event: 'workflow_dispatch' },
    'manual-source',
  ],
  ['job for another head', { jobHead: other }, 'migration-job-contract'],
]) {
  test(`rule 3: fallback rejects a ${name}`, async () => {
    await assert.rejects(
      verify({ markers: { [first]: marker } }),
      new RegExp(error)
    );
  });
}

test('rule 3: a legacy wrapper producer is checked at the source and its own head', async () => {
  const { logs, requests } = await verify({
    markers: { [first]: { event: 'workflow_run', runHead: producerHead } },
  });
  assert.deepEqual(logs, [fallbackLog(first)]);
  assert.equal(count(requests, `${workflowPath}?ref=${first}`), 1);
  assert.equal(count(requests, `${workflowPath}?ref=${producerHead}`), 1);
});

test('rule 4: platform marker, checkout and production marker stay bound to the target', () => {
  const evaluate = workflow.slice(
    0,
    workflow.indexOf("<<'STAGING_SOURCE_PROOF'")
  );
  assert.match(evaluate, /jq --arg sha "\$TARGET_SHA"/);
  assert.match(
    evaluate,
    /\$deployment\.sha == \$sha and \$payload\.sha == \$sha/
  );
  const after = workflow.slice(
    workflow.indexOf('          STAGING_SOURCE_PROOF\n')
  );
  assert.match(
    after,
    /ref: \$\{\{ needs\.evaluate-prerequisites\.outputs\.target_sha \}\}/
  );
  assert.match(
    after,
    /DEPLOYMENT_MARKER_SHA: \$\{\{ needs\.evaluate-prerequisites\.outputs\.target_sha \}\}/
  );
  assert.doesNotMatch(evaluate + after, /\bsource_sha\b|\$SOURCE_SHA/);
});
