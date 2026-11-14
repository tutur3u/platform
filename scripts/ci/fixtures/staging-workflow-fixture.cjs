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
  const markerPayload =
    env.MARKER_PAYLOAD === 'empty'
      ? {}
      : env.MARKER_PAYLOAD === 'wrong-sha'
        ? {
            sha: env.UNRELATED_SHA,
            markerKind: 'deployment',
            workflowName: 'supabase-staging.yaml',
          }
        : {
            sha:
              env.MARKER_SHA !== env.PRODUCTION_SHA
                ? env.MARKER_SHA
                : env.STAGING_SHA,
            markerKind: 'deployment',
            workflowName: 'supabase-staging.yaml',
            refName: 'main',
            ref: 'refs/heads/main',
            runId: '201',
            runAttempt: '1',
            runUrl,
          };
  const marker = {
    id: 301,
    sha: target,
    ref: target,
    environment: 'supabase-staging',
    created_at: completed_at,
    payload: markerPayload,
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
      state: env.MARKER_STATE || 'success',
      environment: 'supabase-staging',
      log_url: runUrl,
    },
  ];
  const markersRoute = `${base}/deployments?environment=supabase-staging&sha=${target}&per_page=100&page=1`;
  const runRoute = `${base}/actions/runs/201`;
  const statusRoute = `${base}/deployments/301/statuses?per_page=1&page=1`;
  const calleeWorkflowPath = '.github/workflows/vercel-production-platform.yaml';
  const callerWorkflowPath = '.github/workflows/vercel-production.yaml';
  const callerRunId = env.PLATFORM_CALLER_RUN_ID || '301';
  const calleeRunId = env.PLATFORM_CALLEE_RUN_ID || '501';
  const callerRunUrl = `https://github.com/example/platform/actions/runs/${callerRunId}`;
  const platformMarkerId = Number(env.PLATFORM_MARKER_ID || '96');
  const trustedCreator = {
    login: 'github-actions[bot]',
    id: 41898282,
    type: 'Bot',
  };
  const platformMarker = {
    id: platformMarkerId,
    sha: target,
    ref: target,
    environment: 'vercel-production-platform',
    created_at: completed_at,
    creator: env.PLATFORM_CREATOR_LOGIN
      ? {
          login: env.PLATFORM_CREATOR_LOGIN,
          id: Number(env.PLATFORM_CREATOR_ID || 0),
          type: env.PLATFORM_CREATOR_TYPE || 'User',
        }
      : trustedCreator,
    payload: {
      sha: target,
      markerKind: 'deployment',
      workflowName: 'vercel-production-platform.yaml',
      refName: 'production',
      ref: 'refs/heads/production',
      runId: String(callerRunId),
      runAttempt: env.PLATFORM_RUN_ATTEMPT || '1',
      runUrl: callerRunUrl,
    },
  };
  const callerRepository = env.PLATFORM_REPO_ID
    ? { ...repository, id: Number(env.PLATFORM_REPO_ID) }
    : repository;
  const callerRun = {
    id: Number(callerRunId),
    run_attempt: Number(env.PLATFORM_RUN_ATTEMPT || 1),
    workflow_id: 137637850,
    path: env.PLATFORM_CALLER_WORKFLOW_PATH || callerWorkflowPath,
    head_branch: env.PLATFORM_CALLER_BRANCH || 'production',
    head_sha: env.PLATFORM_CALLER_SHA || target,
    event: env.PLATFORM_CALLER_EVENT || 'push',
    status: env.PLATFORM_CALLER_STATUS || 'completed',
    conclusion: env.PLATFORM_CALLER_CONCLUSION || 'success',
    repository: callerRepository,
    head_repository: callerRepository,
  };
  const calleeRun = {
    id: Number(calleeRunId),
    run_attempt: Number(env.PLATFORM_CALLEE_ATTEMPT || 1),
    workflow_id: 137637851,
    path: env.PLATFORM_CALLEE_WORKFLOW_PATH || calleeWorkflowPath,
    head_branch: env.PLATFORM_CALLEE_BRANCH || 'production',
    head_sha: env.PLATFORM_CALLEE_SHA || target,
    event: 'workflow_call',
    status: env.PLATFORM_CALLEE_STATUS || 'completed',
    conclusion: env.PLATFORM_CALLEE_CONCLUSION || 'success',
    repository,
    head_repository: repository,
  };
  const platformRoute = `${base}/deployments?environment=vercel-production-platform&sha=${target}&per_page=100&page=1`;
  const platformStatusRoute = `${base}/deployments/${platformMarkerId}/statuses?per_page=1&page=1`;
  const callerRunRoute = `${base}/actions/runs/${callerRunId}`;
  const calleeRunsRoute = `${base}/actions/workflows/vercel-production-platform.yaml/runs?head_sha=${target}&status=completed&per_page=100&page=1`;
  const calleeJobsRoute = `${base}/actions/runs/${calleeRunId}/attempts/${env.PLATFORM_CALLEE_ATTEMPT || 1}/jobs?per_page=100&page=1`;
  const callerJobsRoute = `${base}/actions/runs/${callerRunId}/attempts/${env.PLATFORM_RUN_ATTEMPT || 1}/jobs?per_page=100&page=1`;
  const blobs = JSON.parse(fs.readFileSync(env.FIXTURE_BLOBS, 'utf8'));
  const platformContractFiles = [
    '.github/workflows/vercel-production.yaml',
    '.github/workflows/vercel-production-platform.yaml',
    'scripts/ci/record-vercel-deployment.ts',
  ];
  const stagingContractFiles = [
    '.github/workflows/supabase-staging.yaml',
    'scripts/ci/record-deployment-marker.ts',
  ];
  const callerHead = env.PLATFORM_CALLER_SHA || target;
  function pushContractEntries(files, revisions) {
    for (const file of files) {
      const selected = [];
      for (const revision of revisions) {
        const kind =
          files === platformContractFiles
            ? 'new'
            : revision === target
            ? env.TARGET_CONTRACT
            : revision === wrapper
              ? env.WRAPPER_CONTRACT
              : 'new';
        const entry = blobs.find(
          (blob) =>
            blob.path === file &&
            blob.kind ===
              (file === workflowPath && kind !== 'unknown' ? kind : 'new')
        );
        const chosen =
          kind === 'unknown' ? { ...entry, sha: 'd'.repeat(40) } : entry;
        script.push([
          `${base}/contents/${file}?ref=${revision}`,
          { type: 'file', path: file, sha: chosen.sha },
        ]);
        if (!selected.some((item) => item.sha === chosen.sha))
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
  }
  function pushStagingTail() {
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
  }
  function pushStagingOpening(includeStatus) {
    script.push(
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
      [runRoute, run]
    );
    if (includeStatus) script.push([statusRoute, status]);
  }
  const platformStatus = [
    {
      id: 501,
      state: env.PLATFORM_STATUS_STATE || 'success',
      environment: 'vercel-production-platform',
      log_url: env.PLATFORM_STATUS_LOG_URL || callerRunUrl,
    },
  ];
  const script = [];
  const platformProducer = process.argv.some((arg) =>
    arg.includes('verify-github-deployment-marker-producer.mjs')
  );
  function callerPlannerJobs() {
    const attempt = Number(env.PLATFORM_RUN_ATTEMPT || 1);
    const conclusions = new Map([
      ['plan', 'success'],
      ['deploy-platform / Deploy-Production', 'success'],
      ['deploy-colab-cloudflare / deploy', 'success'],
      ['deploy-meet-cloudflare / deploy', 'success'],
      ['deploy-parley-cloudflare / deploy', 'success'],
      ['deploy-mail', 'skipped'],
      ['deploy-tools', 'skipped'],
    ]);
    const overrides = JSON.parse(env.PLANNER_JOB_OVERRIDES || '{}');
    for (const [name, conclusion] of Object.entries(overrides)) {
      if (conclusion === '__remove__') conclusions.delete(name);
      else conclusions.set(name, conclusion);
    }
    for (let index = 0; index < Number(env.PLANNER_PAD_JOBS || 0); index += 1)
      conclusions.set(`deploy-nova / pad ${index}`, 'success');
    const jobs = [...conclusions].map(([name, conclusion], index) => ({
      id: 601 + index,
      name,
      run_id: Number(callerRunId),
      run_attempt: attempt,
      head_sha: callerRun.head_sha,
      status: 'completed',
      conclusion,
      started_at,
      completed_at,
    }));
    if (env.PLANNER_DUPLICATE_JOB_ID === 'true' && jobs.length > 1)
      jobs[1].id = jobs[0].id;
    return jobs;
  }
  function pushPlatformScript() {
    script.push(
      [base, repository],
      [
        `${base}/actions/workflows/vercel-production.yaml`,
        {
          id: 137637850,
          path: callerWorkflowPath,
          name: 'Production Deployment Planner',
          state: 'active',
        },
      ],
      [
        `${base}/actions/workflows/vercel-production-platform.yaml`,
        {
          id: 137637851,
          path: calleeWorkflowPath,
          name: 'Vercel Platform Production Deployment',
          state: 'active',
        },
      ],
      [platformRoute, env.PLATFORM_MARKER_MISSING === 'true' ? [] : [platformMarker]],
      [callerRunRoute, callerRun],
      [platformStatusRoute, platformStatus]
    );
    pushContractEntries(platformContractFiles, [...new Set([target, callerHead])]);
    const plannerJobs = callerPlannerJobs();
    const pages = [];
    for (let at = 0; at < plannerJobs.length || at === 0; at += 100)
      pages.push(plannerJobs.slice(at, at + 100));
    const jobsTotal =
      plannerJobs.length + Number(env.PLANNER_TOTAL_COUNT_DELTA || 0);
    script.push(
      ...pages.map((jobs, index) => [
        callerJobsRoute.replace('&page=1', `&page=${index + 1}`),
        { total_count: jobsTotal, jobs },
      ]),
      [calleeRunsRoute, { total_count: 1, workflow_runs: [calleeRun] }],
      [
        calleeJobsRoute,
        {
          total_count: 1,
          jobs: [
            {
              id: 701,
              name: 'Deploy-Production',
              run_id: Number(calleeRunId),
              run_attempt: Number(env.PLATFORM_CALLEE_ATTEMPT || 1),
              head_sha: calleeRun.head_sha,
              status: 'completed',
              conclusion: 'success',
              started_at,
              completed_at,
              steps: [
                {
                  name: 'Record successful Vercel deployment marker',
                  number: 1,
                  status: 'completed',
                  conclusion: 'success',
                  started_at,
                  completed_at,
                },
              ],
            },
          ],
        },
      ],
      [`${base}/deployments/${platformMarkerId}`, platformMarker],
      [platformStatusRoute, platformStatus],
      [callerRunRoute, callerRun]
    );
  }
  function pushStagingScript() {
    pushStagingOpening(run.event !== 'workflow_dispatch');
    pushContractEntries(stagingContractFiles, [...new Set([target, wrapper])]);
    if (run.event === 'workflow_dispatch') script.push([statusRoute, status]);
    pushStagingTail();
  }
  if (platformProducer) {
    pushPlatformScript();
  } else if (env.VERIFY_PLATFORM_MARKER !== 'false') {
    pushStagingScript();
  } else {
    pushStagingOpening(run.event !== 'workflow_dispatch');
    pushContractEntries(
      [...new Set(blobs.map((entry) => entry.path))],
      [target, wrapper]
    );
    if (run.event === 'workflow_dispatch') script.push([statusRoute, status]);
    pushStagingTail();
  }
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
