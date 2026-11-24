// Shared GitHub API world for the production marker producer tests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  profileConfig,
  runVerification,
} from '../verify-github-deployment-marker-producer.mjs';

export const profile = profileConfig('production-web');
export const source = 'a'.repeat(40);
export const repo = 'example/platform';
export const server = 'https://github.com';
export const repository = { id: 101, full_name: repo };
export const callerWorkflow = {
  id: 137637850,
  path: profile.callerWorkflowPath,
  name: profile.callerWorkflowDisplayName,
};
export const calleeWorkflow = {
  id: 137637851,
  path: profile.calleeWorkflowPath,
  name: profile.calleeWorkflowDisplayName,
};

export async function fixture(t, change = () => {}) {
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
    const bytes = readFileSync(new URL(`../../../${file}`, import.meta.url));
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

export function recoveryWorld(world, outsideCanonical = false) {
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
