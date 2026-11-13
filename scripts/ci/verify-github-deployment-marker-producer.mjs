// Production platform deployment marker producer verification for migration apply.
// Marker payload runId/runUrl come from record-vercel-deployment.ts (GITHUB_RUN_ID of the
// Production Deployment Planner caller); workflowName in payload is the callee workflow file.
const assert = (ok, code) => {
  if (!ok) throw new Error(code);
};
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const stamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const snapshot = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  );

// GITHUB_TOKEN deployment creation from vercel-production-platform record steps.
const TRUSTED_DEPLOYMENT_MARKER_CREATOR = Object.freeze({
  login: 'github-actions[bot]',
  id: 41898282,
  type: 'Bot',
});

const PRODUCTION_PLATFORM = {
  environment: 'vercel-production-platform',
  markerWorkflowName: 'vercel-production-platform.yaml',
  refName: 'production',
  ref: 'refs/heads/production',
  callerWorkflowName: 'vercel-production.yaml',
  callerWorkflowPath: '.github/workflows/vercel-production.yaml',
  callerWorkflowDisplayName: 'Production Deployment Planner',
  callerAllowedEvents: Object.freeze(['push', 'workflow_dispatch']),
  callerDeployJobName: 'deploy-platform',
  calleeWorkflowName: 'vercel-production-platform.yaml',
  calleeWorkflowPath: '.github/workflows/vercel-production-platform.yaml',
  calleeWorkflowDisplayName: 'Vercel Platform Production Deployment',
  calleeDeployJobName: 'Deploy-Production',
  recordStep: 'Record successful Vercel deployment marker',
  trustedDeploymentCreator: TRUSTED_DEPLOYMENT_MARKER_CREATOR,
  contracts: [
    [
      '.github/workflows/vercel-production.yaml',
      ['76197c03e41dca432e53619bc384cfdd1c879576'],
    ],
    [
      '.github/workflows/vercel-production-platform.yaml',
      [
        'b1e5dead4ac84db1b5f9e498026c21e6b2eae730',
        '4f7ada884d805edda91cd25c1abeef196b0e4508',
        '5cbada1d00428fb1b2f6480ae5cf1421146d79bc',
      ],
    ],
    [
      'scripts/ci/record-vercel-deployment.ts',
      ['53b07b48226b55ad967e95a85cd62e22d449b07c'],
    ],
  ],
};

export function profileConfig(name) {
  if (name === 'production-platform' || name === 'vercel-production-platform')
    return PRODUCTION_PLATFORM;
  return null;
}

export function checkMarkerCreator(deployment, trusted) {
  assert(
    deployment.creator?.login === trusted.login &&
      deployment.creator?.id === trusted.id &&
      deployment.creator?.type === trusted.type,
    'marker-creator-contract'
  );
}

export function checkMarkerPayload(d, p, profile, source) {
  checkMarkerCreator(d, profile.trustedDeploymentCreator);
  assert(
    positive(d.id) &&
      d.sha === source &&
      d.ref === source &&
      d.environment === profile.environment &&
      p.sha === source &&
      p.markerKind === 'deployment' &&
      p.workflowName === profile.markerWorkflowName &&
      p.refName === profile.refName &&
      p.ref === profile.ref,
    'marker-source-contract'
  );
  assert(
    typeof p.runId === 'string' &&
      /^[1-9][0-9]*$/.test(p.runId) &&
      typeof p.runAttempt === 'string' &&
      /^[1-9][0-9]*$/.test(p.runAttempt),
    'marker-producer'
  );
  assert(
    positive(Number(p.runId)) && positive(Number(p.runAttempt)),
    'marker-producer-range'
  );
}

export function checkCallerProducerIdentity(
  run,
  p,
  repository,
  repo,
  callerWorkflow,
  profile
) {
  assert(
    run.id === Number(p.runId) &&
      run.workflow_id === callerWorkflow.id &&
      run.path === profile.callerWorkflowPath &&
      run.head_branch === profile.refName &&
      sha(run.head_sha) &&
      run.repository?.id === repository.id &&
      run.repository?.full_name === repo &&
      run.head_repository?.id === repository.id &&
      run.head_repository?.full_name === repo,
    'producer-identity-contract'
  );
}

export function checkCallerProducerAttempt(run, profile, source) {
  assert(
    run.run_attempt >= 1 &&
      profile.callerAllowedEvents.includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'producer-current-attempt-contract'
  );
  assert(run.head_sha === source, 'direct-source');
}

export function checkCalleeProducerAttempt(run, profile, source) {
  assert(
    run.workflow_id > 0 &&
      run.path === profile.calleeWorkflowPath &&
      run.head_branch === profile.refName &&
      run.head_sha === source &&
      run.event === 'workflow_call' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'callee-producer-contract'
  );
}

function payload(deployment) {
  const p =
    typeof deployment.payload === 'string'
      ? JSON.parse(deployment.payload)
      : deployment.payload;
  assert(p && typeof p === 'object' && !Array.isArray(p), 'marker-payload');
  return p;
}

async function main() {
  const profile = profileConfig(
    process.env.MARKER_VERIFY_PROFILE || 'production-platform'
  );
  assert(profile, 'proof-profile');
  const repo = process.env.GITHUB_REPOSITORY;
  const source = process.env.TARGET_SHA;
  const token = process.env.GH_TOKEN;
  const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(
    /\/$/,
    ''
  );
  const server = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(
    /\/$/,
    ''
  );
  assert(
    typeof repo === 'string' &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) &&
      sha(source) &&
      typeof token === 'string' &&
      token.length > 0,
    'proof-input'
  );
  for (const origin of [api, server]) {
    const url = new URL(origin);
    assert(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      'proof-origin'
    );
  }
  const deadline = Date.now() + 120000;
  let requests = 0;
  async function get(route) {
    assert(route.startsWith('/repos/') && ++requests <= 50, 'request-budget');
    const remaining = deadline - Date.now();
    assert(remaining > 0, 'proof-deadline');
    const response = await fetch(`${api}${route}`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(Math.min(10000, remaining)),
    });
    assert(response.ok, 'api-response');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        assert(size <= 2097152, 'response-size');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    return {
      data: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      next: /rel="next"/.test(response.headers.get('link') || ''),
    };
  }
  async function inventory(route, key) {
    const result = [];
    const ids = new Set();
    let total;
    for (let page = 1; page <= 5; page += 1) {
      const { data, next } = await get(
        `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`
      );
      const rows = key ? data[key] : data;
      assert(Array.isArray(rows) && rows.length <= 100, 'inventory-shape');
      if (key) {
        assert(
          Number.isSafeInteger(data.total_count) && data.total_count >= 0,
          'inventory-count'
        );
        total ??= data.total_count;
        assert(
          total === data.total_count && total <= 499,
          'inventory-overflow-or-change'
        );
      }
      for (const row of rows) {
        assert(positive(row.id) && !ids.has(row.id), 'inventory-identity');
        ids.add(row.id);
        result.push(row);
      }
      if (rows.length < 100 && !next) {
        assert(!key || total === result.length, 'inventory-incomplete');
        return result;
      }
    }
    throw new Error('inventory-overflow');
  }
  const base = `/repos/${repo}`;
  const { data: repository } = await get(base);
  assert(
    positive(repository.id) &&
      repository.full_name === repo &&
      repository.default_branch === 'main',
    'repository-identity'
  );
  const { data: callerWorkflow } = await get(
    `${base}/actions/workflows/${profile.callerWorkflowName}`
  );
  assert(
    positive(callerWorkflow.id) &&
      callerWorkflow.path === profile.callerWorkflowPath &&
      callerWorkflow.name === profile.callerWorkflowDisplayName &&
      callerWorkflow.state === 'active',
    'caller-workflow-identity'
  );
  const { data: calleeWorkflow } = await get(
    `${base}/actions/workflows/${profile.calleeWorkflowName}`
  );
  assert(
    positive(calleeWorkflow.id) &&
      calleeWorkflow.path === profile.calleeWorkflowPath &&
      calleeWorkflow.name === profile.calleeWorkflowDisplayName &&
      calleeWorkflow.state === 'active',
    'callee-workflow-identity'
  );
  const rows = await inventory(
    `${base}/deployments?environment=${profile.environment}&sha=${source}`
  );
  assert(
    rows.length > 0 &&
      rows.every(
        (d) =>
          d.sha === source &&
          d.environment === profile.environment &&
          stamp(d.created_at)
      ),
    'marker-inventory-source'
  );
  rows.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
  );
  let marker;
  let p;
  let callerRun;
  for (const candidate of rows) {
    try {
      const payloadValue = payload(candidate);
      if (payloadValue.markerKind !== 'deployment') continue;
      if (payloadValue.workflowName !== profile.markerWorkflowName) continue;
      checkMarkerPayload(candidate, payloadValue, profile, source);
      p = payloadValue;
      assert(
        p.runUrl === `${server}/${repo}/actions/runs/${p.runId}`,
        'marker-run-url'
      );
      const { data: candidateRun } = await get(
        `${base}/actions/runs/${p.runId}`
      );
      checkCallerProducerIdentity(
        candidateRun,
        p,
        repository,
        repo,
        callerWorkflow,
        profile
      );
      checkCallerProducerAttempt(candidateRun, profile, source);
      marker = candidate;
      callerRun = candidateRun;
      break;
    } catch {
      continue;
    }
  }
  assert(marker && p && callerRun, 'eligible-marker-missing');
  const { data: statusRows } = await get(
    `${base}/deployments/${marker.id}/statuses?per_page=1&page=1`
  );
  assert(
    Array.isArray(statusRows) &&
      statusRows.length === 1 &&
      positive(statusRows[0].id) &&
      statusRows[0].state === 'success' &&
      statusRows[0].environment === profile.environment &&
      statusRows[0].log_url === p.runUrl,
    'marker-latest-status'
  );
  const sourceContracts = new Map();
  async function checkContracts(producerHead) {
    if (sourceContracts.has(producerHead)) return sourceContracts.get(producerHead);
    let producerWorkflow;
    for (const [path, allowed] of profile.contracts) {
      const unique = new Set();
      for (const revision of new Set([source, producerHead])) {
        const { data: entry } = await get(`${base}/contents/${path}?ref=${revision}`);
        assert(
          entry.type === 'file' &&
            entry.path === path &&
            allowed.includes(entry.sha),
          'unknown-producer-contract'
        );
        unique.add(entry.sha);
        if (path === profile.calleeWorkflowPath && revision === producerHead)
          producerWorkflow = entry.sha;
      }
      for (const expected of unique) {
        const { data: blob } = await get(`${base}/git/blobs/${expected}`);
        assert(
          blob.sha === expected &&
            blob.encoding === 'base64' &&
            Number.isSafeInteger(blob.size) &&
            blob.size > 0 &&
            blob.size <= 65536 &&
            typeof blob.content === 'string',
          'contract-blob-shape'
        );
        const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
        assert(bytes.length === blob.size, 'contract-blob-size');
        const object = Buffer.concat([
          Buffer.from(`blob ${bytes.length}\0`),
          bytes,
        ]);
        const digest = Buffer.from(
          await crypto.subtle.digest('SHA-1', object)
        ).toString('hex');
        assert(digest === expected, 'contract-blob-hash');
      }
    }
    sourceContracts.set(producerHead, producerWorkflow);
    return producerWorkflow;
  }
  await checkContracts(callerRun.head_sha);
  const callerJobs = await inventory(
    `${base}/actions/runs/${p.runId}/attempts/${p.runAttempt}/jobs`,
    'jobs'
  );
  const callerJob = callerJobs.find(
    (row) => row.name === profile.callerDeployJobName
  );
  assert(
    callerJob &&
      callerJob.run_id === callerRun.id &&
      callerJob.run_attempt === callerRun.run_attempt &&
      callerJob.head_sha === callerRun.head_sha &&
      callerJob.status === 'completed' &&
      callerJob.conclusion === 'success',
    'caller-deploy-job-contract'
  );
  const childRuns = await inventory(
    `${base}/actions/workflows/${profile.calleeWorkflowName}/runs?head_sha=${source}&status=completed`,
    'workflow_runs'
  );
  const calleeRun = childRuns.find(
    (row) =>
      row.head_sha === source &&
      row.head_branch === profile.refName &&
      row.event === 'workflow_call' &&
      row.conclusion === 'success' &&
      row.status === 'completed' &&
      row.path === profile.calleeWorkflowPath
  );
  assert(calleeRun, 'callee-producer-missing');
  checkCalleeProducerAttempt(calleeRun, profile, source);
  assert(calleeRun.workflow_id === calleeWorkflow.id, 'callee-workflow-binding');
  const calleeJobs = await inventory(
    `${base}/actions/runs/${calleeRun.id}/attempts/${calleeRun.run_attempt}/jobs`,
    'jobs'
  );
  const calleeJob = calleeJobs.find(
    (row) => row.name === profile.calleeDeployJobName
  );
  assert(
    calleeJob &&
      calleeJob.run_id === calleeRun.id &&
      calleeJob.run_attempt === calleeRun.run_attempt &&
      calleeJob.head_sha === calleeRun.head_sha &&
      calleeJob.status === 'completed' &&
      calleeJob.conclusion === 'success',
    'callee-deploy-job-contract'
  );
  const recordSteps = calleeJob.steps.filter(
    (step) => step.name === profile.recordStep
  );
  assert(recordSteps.length === 1, 'migration-step-identity');
  assert(
    recordSteps[0].status === 'completed' &&
      recordSteps[0].conclusion === 'success',
    'migration-step-success'
  );
  const { data: rereadMarker } = await get(`${base}/deployments/${marker.id}`);
  checkMarkerPayload(rereadMarker, payload(rereadMarker), profile, source);
  assert(snapshot(rereadMarker) === snapshot(marker), 'marker-changed');
  const { data: rereadStatus } = await get(
    `${base}/deployments/${marker.id}/statuses?per_page=1&page=1`
  );
  assert(
    snapshot(rereadStatus[0]) === snapshot(statusRows[0]),
    'marker-status-changed'
  );
  const { data: rereadRun } = await get(`${base}/actions/runs/${p.runId}`);
  checkCallerProducerIdentity(
    rereadRun,
    p,
    repository,
    repo,
    callerWorkflow,
    profile
  );
  checkCallerProducerAttempt(rereadRun, profile, source);
  assert(snapshot(rereadRun) === snapshot(callerRun), 'producer-changed');
  assert(Date.now() <= deadline, 'proof-deadline');
  console.log(
    `Production platform deployment marker caller=${callerRun.id} callee=${calleeRun.id} deployment=${marker.id}`
  );
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
