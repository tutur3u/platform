const assert = require('node:assert/strict');

function installFetchFixture() {
  const fs = require('node:fs');
  const env = process.env;
  const target = env.PRODUCTION_SHA;
  const wrapper = env.FIXTURE_WRAPPER_SHA;
  const base = '/repos/example/platform';
  const workflowPath = '.github/workflows/supabase-staging.yaml';
  const runUrl = 'https://github.com/example/platform/actions/runs/201';
  const started_at = '2026-01-01T00:00:00Z';
  const completed_at = '2026-01-01T00:01:00Z';
  const marker = {
    id: 301,
    sha: target,
    ref: target,
    environment: 'supabase-staging',
    created_at: completed_at,
    payload: {
      sha: env.STAGING_SHA,
      markerKind: 'deployment',
      workflowName: 'supabase-staging.yaml',
      refName: 'main',
      ref: 'refs/heads/main',
      runId: '201',
      runAttempt: '1',
      runUrl,
    },
  };
  const repository = {
    id: 101,
    full_name: 'example/platform',
    default_branch: 'main',
  };
  const run = {
    id: 201,
    run_attempt: 1,
    workflow_id: 102,
    path: workflowPath,
    head_branch: env.STAGING_BRANCH,
    head_sha: wrapper,
    event: env.STAGING_RUN_EVENT || 'workflow_run',
    status: env.STAGING_STATUS,
    conclusion: env.STAGING_RESULT,
    repository,
    head_repository: repository,
  };
  const status = [
    {
      id: 401,
      state: 'success',
      environment: 'supabase-staging',
      log_url: runUrl,
    },
  ];
  const markersRoute = `${base}/deployments?environment=supabase-staging&sha=${target}&per_page=100&page=1`;
  const runRoute = `${base}/actions/runs/201`;
  const statusRoute = `${base}/deployments/301/statuses?per_page=1&page=1`;
  const script = [
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
    [markersRoute, [marker]],
    [runRoute, run],
    [statusRoute, status],
  ];
  const blobs = JSON.parse(fs.readFileSync(env.FIXTURE_BLOBS, 'utf8'));
  for (const file of [...new Set(blobs.map((entry) => entry.path))]) {
    const selected = [];
    for (const revision of new Set([target, wrapper])) {
      const kind =
        revision === target ? env.TARGET_CONTRACT : env.WRAPPER_CONTRACT;
      const entry = blobs.find(
        (entry) =>
          entry.path === file &&
          entry.kind ===
            (file === workflowPath && kind !== 'unknown' ? kind : 'new')
      );
      const chosen =
        kind === 'unknown' ? { ...entry, sha: 'd'.repeat(40) } : entry;
      script.push([
        `${base}/contents/${file}?ref=${revision}`,
        { type: 'file', path: file, sha: chosen.sha },
      ]);
      if (!selected.some((entry) => entry.sha === chosen.sha))
        selected.push(chosen);
    }
    for (const { sha, bytes } of selected)
      script.push([
        `${base}/git/blobs/${sha}`,
        {
          sha,
          encoding: 'base64',
          size: Buffer.from(bytes, 'base64').length,
          content: bytes,
        },
      ]);
  }
  // Manual classification verifies immutable source before selected status proof.
  if (run.event === 'workflow_dispatch') script.push(script.splice(4, 1)[0]);
  script.push(
    [
      `${runRoute}/attempts/1/jobs?per_page=100&page=1`,
      {
        total_count: 1,
        jobs: [
          {
            id: 501,
            name: 'Migrate staging database',
            run_id: 201,
            run_attempt: 1,
            head_sha: wrapper,
            status: 'completed',
            conclusion: 'success',
            started_at,
            completed_at,
            steps: [
              'Check out migration target',
              'Deploy migrations to staging',
              'Record successful staging migration marker',
            ].map((name, index) => ({
              name,
              number: index + 1,
              status: 'completed',
              conclusion: 'success',
              started_at,
              completed_at,
            })),
          },
        ],
      },
    ],
    [markersRoute, [marker]],
    [`${base}/deployments/301`, marker],
    [statusRoute, status],
    [runRoute, run]
  );
  const laterPush = env.STAGING_LATER_PUSH === 'true';
  if (env.STAGING_LATER_MANUAL === 'true' || laterPush) {
    const laterUrl = 'https://github.com/example/platform/actions/runs/202';
    const later = {
      ...marker,
      id: 302,
      created_at: '2026-01-01T00:02:00Z',
      payload: { ...marker.payload, runId: '202', runUrl: laterUrl },
    };
    const laterRun = {
      ...run,
      id: 202,
      event: laterPush ? 'push' : 'workflow_dispatch',
      head_sha: target,
      run_attempt: Number(env.MANUAL_ATTEMPT || 1),
      status: env.MANUAL_STATUS || 'completed',
      conclusion: laterPush
        ? 'failure'
        : env.MANUAL_RESULT === ''
          ? null
          : env.MANUAL_RESULT || 'success',
      ...(env.MANUAL_WRONG_REPOSITORY === 'true'
        ? { repository: { ...repository, id: 999 } }
        : {}),
    };
    const replies = new Map(script);
    replies.set(markersRoute, [later, marker]);
    replies.set(`${base}/actions/runs/202`, laterRun);
    replies.set(`${base}/deployments/302`, later);
    replies.set(`${base}/deployments/302/statuses?per_page=1&page=1`, [
      { ...status[0], id: 402, log_url: laterUrl },
    ]);
    let laterReads = 0;
    let observed = 0;
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      const route = url.pathname + url.search;
      if (
        ++observed > 100 ||
        url.origin !== 'https://api.github.com' ||
        options?.method !== 'GET' ||
        options.redirect !== 'error' ||
        !replies.has(route)
      ) {
        fs.appendFileSync(env.REQUEST_LOG, 'FETCH_FIXTURE_UNEXPECTED\n');
        throw new Error('unexpected fixture request');
      }
      fs.appendFileSync(env.REQUEST_LOG, `FETCH ${route}\n`);
      let reply = replies.get(route);
      if (
        route === `${base}/actions/runs/202` &&
        ++laterReads > 1 &&
        env.MANUAL_RECLASSIFIED === 'true'
      )
        reply = { ...laterRun, event: 'push' };
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    return;
  }
  let next = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    const route = url.pathname + url.search;
    const expected = script[next++];
    if (
      url.origin !== 'https://api.github.com' ||
      options?.method !== 'GET' ||
      options.redirect !== 'error' ||
      !expected ||
      route !== expected[0]
    ) {
      fs.appendFileSync(env.REQUEST_LOG, 'FETCH_FIXTURE_UNEXPECTED\n');
      throw new Error('unexpected fixture request');
    }
    fs.appendFileSync(env.REQUEST_LOG, `FETCH ${route}\n`);
    return new Response(JSON.stringify(expected[1]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function assertStagingWorkflowControls(deployJob) {
  assert.doesNotMatch(
    deployJob,
    /changed_files|check-workflow-config|resolve-changed-files/
  );
  assert.match(
    deployJob,
    /STAGING_ENABLED: \$\{\{ steps\.check_config\.outputs\.should_run \}\}/
  );
  assert.match(deployJob, /import \{ ci \} from '\.\/tuturuuu\.ci\.ts'/);
  assert.match(deployJob, /typeof enabled !== 'boolean'/);
  assert.match(
    deployJob,
    /Deploy migrations to staging\n {8}if: steps\.trigger\.outputs\.trusted == 'true' && steps\.evaluate\.outputs\.should_deploy == 'true'[\s\S]*supabase db push --include-all/
  );
  assert.match(
    deployJob,
    /Record successful staging migration marker\n {8}if: steps\.trigger\.outputs\.trusted == 'true' && steps\.evaluate\.outputs\.should_deploy == 'true'[\s\S]*DEPLOYMENT_MARKER_SHA: \$\{\{ steps\.trigger\.outputs\.head_sha \}\}/
  );
}

module.exports = { installFetchFixture, assertStagingWorkflowControls };
