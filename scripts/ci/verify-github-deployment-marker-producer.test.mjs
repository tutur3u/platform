import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCallerProducerAttempt,
  checkCallerProducerIdentity,
  checkDeploymentJob,
  runVerification,
  checkMarkerCreator,
  checkMarkerPayload,
  profileConfig,
} from './verify-github-deployment-marker-producer.mjs';

const profile = profileConfig('production-web');
const source = 'a'.repeat(40);
const repo = 'example/platform';
const server = 'https://github.com';
const repository = { id: 101, full_name: repo };
const callerWorkflow = {
  id: 137637850,
  path: profile.callerWorkflowPath,
  name: profile.callerWorkflowDisplayName,
};
const calleeWorkflow = {
  id: 137637851,
  path: profile.calleeWorkflowPath,
  name: profile.calleeWorkflowDisplayName,
};

test('the checked-in production planner is an admitted marker producer contract', () => {
  const bytes = readFileSync(
    new URL(`../../${profile.callerWorkflowPath}`, import.meta.url)
  );
  const sha = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  const [, allowed] = profile.contracts.find(
    ([path]) => path === profile.callerWorkflowPath
  );
  assert.ok(
    allowed.includes(sha),
    `Production planner blob ${sha} needs review and admission`
  );
});

test('legitimate production marker payload passes contract checks', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
    creator: profile.trustedDeploymentCreator,
  };
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  checkMarkerPayload(deployment, payload, profile, source);
  assert.equal(payload.runUrl, runUrl);
});

test('forged deployment creator is rejected', () => {
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
    creator: { login: 'evil', id: 1, type: 'User' },
  };
  assert.throws(
    () => checkMarkerCreator(deployment, profile.trustedDeploymentCreator),
    /marker-creator-contract/
  );
});

test('caller run must match production planner workflow path', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: callerWorkflow.id,
    path: '.github/workflows/evil.yaml',
    head_branch: 'production',
    head_sha: source,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () =>
      checkCallerProducerIdentity(
        run,
        payload,
        repository,
        repo,
        callerWorkflow,
        profile
      ),
    /producer-identity-contract/
  );
});

test('reusable deployment proof belongs to the caller run and its successful record step', () => {
  const run = { id: 301, run_attempt: 1, head_sha: source };
  const job = {
    id: 701,
    run_id: 301,
    run_attempt: 1,
    head_sha: source,
    name: profile.callerDeployJobName,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-11-17T00:00:00Z',
    completed_at: '2026-11-17T00:02:00Z',
    steps: [
      {
        name: profile.recordStep,
        number: 9,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-17T00:01:00Z',
        completed_at: '2026-11-17T00:01:01Z',
      },
    ],
  };
  checkDeploymentJob(job, run, profile);
  for (const override of [
    { run_id: 501 },
    { run_attempt: 2 },
    { head_sha: 'b'.repeat(40) },
    { name: 'Deploy-Production' },
    { steps: [] },
    { conclusion: 'failure' },
  ])
    assert.throws(() =>
      checkDeploymentJob({ ...job, ...override }, run, profile)
    );
  assert.throws(() =>
    checkDeploymentJob(
      { ...job, steps: [{ ...job.steps[0], conclusion: 'skipped' }] },
      run,
      profile
    )
  );
});

test('standalone workflow_dispatch on platform path is rejected as caller', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: calleeWorkflow.id,
    path: profile.calleeWorkflowPath,
    head_branch: 'production',
    head_sha: source,
    event: 'workflow_call',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () =>
      checkCallerProducerIdentity(
        run,
        payload,
        repository,
        repo,
        callerWorkflow,
        profile
      ),
    /producer-identity-contract/
  );
  assert.throws(
    () => checkCallerProducerAttempt(run, profile, source),
    /producer-current-attempt-contract|producer-identity-contract/
  );
});

test('planner attempt conclusion admits success and failure only', () => {
  const run = {
    run_attempt: 1,
    event: 'push',
    status: 'completed',
    head_sha: source,
  };
  for (const conclusion of ['success', 'failure'])
    checkCallerProducerAttempt({ ...run, conclusion }, profile, source);
  for (const conclusion of ['cancelled', 'timed_out', 'skipped', null])
    assert.throws(
      () => checkCallerProducerAttempt({ ...run, conclusion }, profile, source),
      /producer-current-attempt-contract/
    );
  assert.throws(
    () =>
      checkCallerProducerAttempt(
        { ...run, conclusion: 'failure', status: 'in_progress' },
        profile,
        source
      ),
    /producer-current-attempt-contract/
  );
});

test('platform caller job is the nested deploy job name', () => {
  assert.equal(
    profile.callerDeployJobName,
    'deploy-web-cloudflare / Verify-Production'
  );
});

async function fixture(t, change = () => {}) {
  const base = `/repos/${repo}`;
  const directory = mkdtempSync(join(tmpdir(), 'platform-producer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const resultFile = join(directory, 'result.json');
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: callerWorkflow.id,
    path: profile.callerWorkflowPath,
    head_branch: 'production',
    head_sha: source,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  const p = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: 'production',
    ref: 'refs/heads/production',
    runId: '301',
    runAttempt: '1',
    runUrl: `${server}/${repo}/actions/runs/301`,
  };
  const marker = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
    payload: p,
    creator: profile.trustedDeploymentCreator,
    created_at: '2026-11-17T00:03:00Z',
  };
  const times = {
    started_at: '2026-11-17T00:00:00Z',
    completed_at: '2026-11-17T00:02:00Z',
  };
  const jobs = ['plan', profile.callerDeployJobName].map((name, i) => ({
    id: 701 + i,
    run_id: 301,
    run_attempt: 1,
    head_sha: source,
    name,
    status: 'completed',
    conclusion: 'success',
    ...times,
    steps: [
      {
        number: 9,
        name: profile.recordStep,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-17T00:01:00Z',
        completed_at: '2026-11-17T00:01:01Z',
      },
    ],
  }));
  const status = {
    id: 97,
    state: 'success',
    environment: profile.environment,
    log_url: p.runUrl,
    created_at: '2026-11-17T00:03:05Z',
  };
  const inactive = {
    id: 98,
    state: 'inactive',
    environment: profile.environment,
    log_url: `${server}/${repo}/actions/runs/999`,
    created_at: '2026-11-17T00:03:20Z',
  };
  const replies = new Map([
    [base, { ...repository, default_branch: 'main' }],
    [
      `${base}/actions/workflows/${profile.callerWorkflowName}`,
      { ...callerWorkflow, state: 'active' },
    ],
    [
      `${base}/deployments?environment=${profile.environment}&sha=${source}&per_page=100&page=1`,
      [marker],
    ],
    [`${base}/actions/runs/301`, run],
    [`${base}/deployments/96/statuses?per_page=100&page=1`, [status]],
    [
      `${base}/deployments?environment=${profile.environment}&per_page=100&page=1`,
      [marker],
    ],
    [
      `${base}/actions/runs/301/attempts/1/jobs?per_page=100&page=1`,
      { total_count: jobs.length, jobs },
    ],
    [`${base}/deployments/96`, marker],
  ]);
  for (const [file, allowed] of profile.contracts) {
    const bytes = readFileSync(new URL(`../../${file}`, import.meta.url));
    const hash = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    assert.ok(
      allowed.includes(hash),
      `current producer contract is explicitly reviewed: ${file}`
    );
    replies.set(`${base}/contents/${file}?ref=${source}`, {
      type: 'file',
      path: file,
      sha: hash,
    });
    replies.set(`${base}/git/blobs/${hash}`, {
      sha: hash,
      encoding: 'base64',
      size: bytes.length,
      content: bytes.toString('base64'),
    });
  }
  const env = {
    GITHUB_REPOSITORY: repo,
    TARGET_SHA: source,
    GH_TOKEN: 'synthetic',
    MARKER_VERIFY_PROFILE: 'production-web',
    PLANNER_RUN_ID: '301',
    PLANNER_RUN_ATTEMPT: '1',
    MARKER_VERIFY_RESULT_FILE: resultFile,
  };
  const world = {
    run,
    marker,
    status,
    inactive,
    jobs,
    replies,
    env,
    mutateReply: (_route, value) => value,
  };
  change(world);
  const requests = [];
  const result = await runVerification({
    env,
    request: async (input, init) => {
      const url = new URL(input);
      const route = url.pathname + url.search;
      assert.equal(init.method, 'GET');
      requests.push(route);
      assert.ok(replies.has(route), `unexpected request: ${route}`);
      const value = world.mutateReply(route, replies.get(route), requests);
      return new Response(JSON.stringify(value), { status: 200 });
    },
  });
  assert.deepEqual(JSON.parse(readFileSync(resultFile, 'utf8')), result);
  return { result, requests };
}

test('caller nested job proves an exact production marker without a separate callee run', async (t) => {
  const { result, requests } = await fixture(t);
  assert.equal(result.status, 'success');
  assert.equal(result.producer, 301);
  assert.equal(result.attempt, 1);
  assert.equal(result.guard, 'MARKER_PROVENANCE_VERIFIED');
  assert.ok(requests.length <= 50);
  assert.ok(
    !requests.some((route) =>
      route.includes('web-cloudflare-production.yaml/runs')
    )
  );
});

function recoveryWorld(world, outsideCanonical = false) {
  world.run.name = 'Production Deployment Planner';
  world.run.conclusion = 'failure';
  Object.assign(world.env, {
    ALLOW_FAILED_PLANNER: 'true',
    EVENT_NAME: 'workflow_dispatch',
    CURRENT_REF_NAME: 'production',
    EXPECTED_SHA: source,
  });
  const cases = [
    ['deploy-lettin-cloudflare', 'Verify deployed storage and version'],
    ['deploy-meet-cloudflare', 'Verify canonical routes'],
    ['deploy-parley-cloudflare', 'Verify rendered canonical route'],
  ];
  for (const [caller, step] of cases) {
    for (const stage of ['validate', 'deploy']) {
      const conclusion =
        !outsideCanonical &&
        caller === 'deploy-meet-cloudflare' &&
        stage === 'deploy'
          ? 'failure'
          : 'success';
      world.jobs.push({
        ...world.jobs[0],
        id: 800 + world.jobs.length,
        name: `${caller} / ${stage}`,
        conclusion,
        steps: [{ name: step, status: 'completed', conclusion }],
      });
    }
  }
  if (outsideCanonical)
    world.jobs.push({
      ...world.jobs[0],
      id: 999,
      name: 'deploy-mail / deploy',
      conclusion: 'failure',
      steps: [{ name: 'Deploy', status: 'completed', conclusion: 'failure' }],
    });
  for (const job of world.jobs) job.head_branch = 'production';
  world.replies.get(
    `/repos/${repo}/actions/runs/301/attempts/1/jobs?per_page=100&page=1`
  ).total_count = world.jobs.length;
}

test('legacy exact manual canonical-route recovery remains admissible', async (t) => {
  const { result } = await fixture(t, (world) => recoveryWorld(world));
  assert.equal(result.status, 'success');
});

test('positive app classification cannot widen canonical recovery', async (t) => {
  const { result } = await fixture(t, (world) => recoveryWorld(world, true));
  assert.equal(result.status, 'denied');
  assert.equal(result.phase, 'jobs');
});

for (const [label, change] of [
  [
    'forged creator',
    (w) => {
      w.marker.creator = { login: 'attacker', id: 1, type: 'User' };
    },
  ],
  [
    'stale marker attempt',
    (w) => {
      w.marker.payload.runAttempt = '2';
    },
  ],
  [
    'wrong producer id',
    (w) => {
      w.env.PLANNER_RUN_ID = '302';
    },
  ],
  [
    'failed planner without legacy recovery',
    (w) => {
      w.run.conclusion = 'failure';
    },
  ],
  [
    'unsuccessful record step',
    (w) => {
      w.jobs[1].steps[0].conclusion = 'skipped';
    },
  ],
  [
    'unknown caller job',
    (w) => {
      w.jobs[0].name = 'unreviewed-job';
    },
  ],
  [
    'changed latest status',
    (w) => {
      w.status.state = 'failure';
    },
  ],
  [
    'job changes during proof',
    (w) => {
      w.mutateReply = (route, value, requests) =>
        route.includes('/jobs?') &&
        requests.filter((r) => r === route).length > 1
          ? {
              ...value,
              jobs: value.jobs.map((j) => ({ ...j, conclusion: 'cancelled' })),
            }
          : value;
    },
  ],
  [
    'run changes during proof',
    (w) => {
      w.mutateReply = (route, value, requests) =>
        route.endsWith('/actions/runs/301') &&
        requests.filter((r) => r === route).length > 1
          ? { ...value, run_attempt: 2 }
          : value;
    },
  ],
]) {
  test(`provenance rejects ${label} with a persisted fixed stop code`, async (t) => {
    const { result } = await fixture(t, change);
    assert.equal(result.status, 'denied');
    assert.equal(result.guard, 'MARKER_PROVENANCE_DENIED');
    assert.ok(
      ['input', 'identity', 'marker', 'contracts', 'jobs', 'recheck'].includes(
        result.phase
      )
    );
  });
}

const statusRoute = `/repos/${repo}/deployments/96/statuses?per_page=100&page=1`;
const environmentRoute = `/repos/${repo}/deployments?environment=${profile.environment}&per_page=100&page=1`;

test('a success later auto-inactivated by the same SHA deployment is accepted', async (t) => {
  const { result } = await fixture(t, (world) => {
    world.replies.set(statusRoute, [world.inactive, world.status]);
    world.replies.set(environmentRoute, [
      {
        id: 95,
        sha: source,
        environment: profile.environment,
        created_at: '2026-11-17T00:03:10Z',
      },
      world.marker,
    ]);
  });
  assert.equal(result.status, 'success');
});

for (const [name, statusRows, deployments] of [
  [
    'an inactive marker without any prior success is refused',
    (w) => [w.inactive],
    undefined,
  ],
  [
    'a failure after the success is refused even before the inactive row',
    (w) => [
      w.inactive,
      {
        ...w.status,
        id: 99,
        state: 'failure',
        created_at: '2026-11-17T00:03:10Z',
      },
      w.status,
    ],
    undefined,
  ],
  [
    'an error status is refused',
    (w) => [
      {
        ...w.status,
        id: 100,
        state: 'error',
        created_at: '2026-11-17T00:03:10Z',
      },
      w.status,
    ],
    undefined,
  ],
  [
    'a success from another environment or run is refused',
    (w) => [{ ...w.status, log_url: `${server}/${repo}/actions/runs/777` }],
    undefined,
  ],
  [
    'a marker that is absent from the newest deployment page is refused',
    (w) => [w.inactive, w.status],
    () => [
      {
        id: 130,
        sha: source,
        environment: profile.environment,
        created_at: '2026-11-17T00:09:00Z',
      },
    ],
  ],
  [
    'an unordered environment page is refused',
    (w) => [w.inactive, w.status],
    (w) => [
      {
        id: 140,
        sha: source,
        environment: profile.environment,
        created_at: '2026-11-17T00:01:00Z',
      },
      w.marker,
    ],
  ],
  [
    'a different-SHA row above the marker on the page is refused',
    (w) => [w.inactive, w.status],
    (w) => [
      {
        id: 141,
        sha: 'e'.repeat(40),
        environment: profile.environment,
        created_at: '2026-11-17T00:03:30Z',
      },
      w.marker,
    ],
  ],
  [
    'a newer deployment of a different SHA supersedes the marker',
    (w) => [w.inactive, w.status],
    (w) => [
      {
        id: 120,
        sha: 'f'.repeat(40),
        environment: profile.environment,
        created_at: '2026-11-17T00:04:00Z',
      },
      w.marker,
    ],
  ],
]) {
  test(name, async (t) => {
    const { result } = await fixture(t, (world) => {
      world.replies.set(statusRoute, statusRows(world));
      if (deployments) world.replies.set(environmentRoute, deployments(world));
    });
    assert.equal(result.status, 'denied');
    assert.equal(result.guard, 'MARKER_PROVENANCE_DENIED');
    assert.equal(result.phase, 'marker');
  });
}

test('a long environment history is read through its first page only', async (t) => {
  const start = Date.parse('2026-11-16T00:00:00Z');
  const { result, requests } = await fixture(t, (world) => {
    world.replies.set(statusRoute, [world.inactive, world.status]);
    world.replies.set(environmentRoute, [
      world.marker,
      ...Array.from({ length: 99 }, (_, index) => ({
        id: 2000 + index,
        sha: 'd'.repeat(40),
        environment: profile.environment,
        created_at: new Date(start - index * 1000).toISOString(),
      })),
    ]);
  });
  assert.equal(result.status, 'success');
  assert.ok(!requests.some((route) => route.includes('page=2')));
  assert.equal(
    requests.filter((route) => route === environmentRoute).length,
    2
  );
});
