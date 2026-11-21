// Production platform deployment marker producer verification for migration apply.
// A failed planner also requires the existing canonical Cloudflare recovery gate;
// positive job classification is an additional restriction, never a new recovery path.
// Marker payload runId/runUrl come from record-vercel-deployment.ts (GITHUB_RUN_ID of the
// Production Deployment Planner caller); workflowName in payload is the callee workflow file.
import { appendFileSync, writeFileSync } from 'node:fs';
import {
  classifyPlannerJobs,
  heldAppSummary,
} from './production-planner-job-classes.mjs';
import { checkProductionMigrationRecovery } from './check-production-migration-recovery.ts';
import {
  effectiveMarkerStatus,
  markerSuperseded,
} from './deployment-marker-status.mjs';

const assert = (ok, code) => {
  if (!ok) throw new Error(code);
};
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const stamp = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
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

const LEGACY_VERCEL_PLANNER_CONTRACTS = Object.freeze([
  '76197c03e41dca432e53619bc384cfdd1c879576',
  '45d2697d42ff3a645b2d5b8722342d5c64dd08ef',
  '0d1e108c5cce714a6628816b40cb506c87769ace',
]);
// This planner omits retired Vercel jobs and retains the platform producer.
const POST_RETIREMENT_PLANNER_CONTRACT =
  '8c90988f9299c5c28d9f49049077a0b93b225b3d';
// This planner also skips superseded pushes before selecting targets.
const SUPERSEDED_SKIP_PLANNER_CONTRACT =
  '821f197ff27852c19c422fcaabcbbe7c37e8fe5e';
// This planner also grants the Colab job id-token: write for the deployment
// coordinator. Platform proof is unchanged.
const COLAB_OIDC_PLANNER_CONTRACT = '8bbb84a2ff0c72db5127a2ff2f8c8943a530c697';
// This planner also publishes the deployment coordinator as an independent
// app and grants id-token: write to every caller whose deploy job reports to
// it. Platform proof is unchanged.
const CURRENT_PLANNER_CONTRACT = '5dcdb368b1e7ac00cbadfa4c846436462acb10e5';

const PRODUCTION_PLATFORM = {
  environment: 'vercel-production-platform',
  markerWorkflowName: 'vercel-production-platform.yaml',
  refName: 'production',
  ref: 'refs/heads/production',
  callerWorkflowName: 'vercel-production.yaml',
  callerWorkflowPath: '.github/workflows/vercel-production.yaml',
  callerWorkflowDisplayName: 'Production Deployment Planner',
  callerAllowedEvents: Object.freeze(['push', 'workflow_dispatch']),
  callerDeployJobName: 'deploy-platform / Deploy-Production',
  calleeWorkflowName: 'vercel-production-platform.yaml',
  calleeWorkflowPath: '.github/workflows/vercel-production-platform.yaml',
  calleeWorkflowDisplayName: 'Vercel Platform Production Deployment',
  calleeDeployJobName: 'Deploy-Production',
  recordStep: 'Record successful Vercel deployment marker',
  trustedDeploymentCreator: TRUSTED_DEPLOYMENT_MARKER_CREATOR,
  contracts: [
    [
      '.github/workflows/vercel-production.yaml',
      [
        ...LEGACY_VERCEL_PLANNER_CONTRACTS,
        POST_RETIREMENT_PLANNER_CONTRACT,
        SUPERSEDED_SKIP_PLANNER_CONTRACT,
        COLAB_OIDC_PLANNER_CONTRACT,
        CURRENT_PLANNER_CONTRACT,
      ],
    ],
    [
      '.github/workflows/vercel-production-platform.yaml',
      [
        '7d5cbcc55e8915a6343390c60dfc6ac372743534',
        'a014ca72ba9b8a1d02297fc189be7e358190604b',
        'b1e5dead4ac84db1b5f9e498026c21e6b2eae730',
        '4f7ada884d805edda91cd25c1abeef196b0e4508',
        '5cbada1d00428fb1b2f6480ae5cf1421146d79bc',
        // Reports the deploy job to the deployment coordinator around its
        // publish steps; the marker step and its proof are unchanged.
        'ac102388e545887cc5aaef6f333aa17c6dc6d373',
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
      (run.conclusion === 'success' || run.conclusion === 'failure'),
    'producer-current-attempt-contract'
  );
  assert(run.head_sha === source, 'direct-source');
}

export function checkDeploymentJob(job, run, profile) {
  assert(
    job &&
      positive(job.id) &&
      job.name === profile.callerDeployJobName &&
      job.run_id === run.id &&
      job.run_attempt === run.run_attempt &&
      job.head_sha === run.head_sha &&
      job.status === 'completed' &&
      job.conclusion === 'success' &&
      stamp(job.started_at) &&
      stamp(job.completed_at) &&
      Date.parse(job.completed_at) >= Date.parse(job.started_at) &&
      Array.isArray(job.steps),
    'caller-deploy-job-contract'
  );
  // Reusable workflows execute as nested jobs of their caller, with its run identity.
  const records = job.steps.filter((step) => step.name === profile.recordStep);
  assert(records.length === 1, 'marker-step-identity');
  const step = records[0];
  assert(
    positive(step.number) &&
      step.status === 'completed' &&
      step.conclusion === 'success' &&
      stamp(step.started_at) &&
      stamp(step.completed_at) &&
      Date.parse(step.completed_at) >= Date.parse(step.started_at) &&
      Date.parse(step.started_at) >= Date.parse(job.started_at) &&
      Date.parse(step.completed_at) <= Date.parse(job.completed_at),
    'marker-step-success'
  );
}

const PHASE = Object.freeze({
  INPUT: 'input',
  IDENTITY: 'identity',
  MARKER: 'marker',
  CONTRACTS: 'contracts',
  JOBS: 'jobs',
  RECHECK: 'recheck',
  COMPLETE: 'complete',
});
function payload(deployment) {
  const p =
    typeof deployment.payload === 'string'
      ? JSON.parse(deployment.payload)
      : deployment.payload;
  assert(p && typeof p === 'object' && !Array.isArray(p), 'marker-payload');
  return p;
}

export async function verifyMarker({
  env = process.env,
  request = fetch,
  onPhase = () => {},
} = {}) {
  const setPhase = (value) => onPhase(value);
  const profile = profileConfig(
    env.MARKER_VERIFY_PROFILE || 'production-platform'
  );
  assert(profile, 'proof-profile');
  const repo = env.GITHUB_REPOSITORY;
  const source = env.TARGET_SHA;
  const token = env.GH_TOKEN;
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(
    /\/$/,
    ''
  );
  const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(
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
  assert(
    /^[1-9][0-9]*$/.test(env.PLANNER_RUN_ID || '') &&
      /^[1-9][0-9]*$/.test(env.PLANNER_RUN_ATTEMPT || ''),
    'planner-input'
  );
  const allowFailure = env.ALLOW_FAILED_PLANNER === 'true';
  const deadline = Date.now() + 120000;
  let requests = 0;
  async function get(route) {
    assert(route.startsWith('/repos/') && ++requests <= 50, 'request-budget');
    const remaining = deadline - Date.now();
    assert(remaining > 0, 'proof-deadline');
    const response = await request(`${api}${route}`, {
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
  setPhase(PHASE.IDENTITY);
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
  setPhase(PHASE.MARKER);
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
      assert(
        String(candidateRun.id) === env.PLANNER_RUN_ID &&
          String(candidateRun.run_attempt) === env.PLANNER_RUN_ATTEMPT &&
          candidateRun.run_attempt === Number(p.runAttempt),
        'planner-selection-binding'
      );
      assert(
        candidateRun.conclusion === 'success' || allowFailure,
        'planner-recovery-required'
      );
      marker = candidate;
      callerRun = candidateRun;
      break;
    } catch {
      continue;
    }
  }
  assert(marker && p && callerRun, 'eligible-marker-missing');
  const statusRoute = `${base}/deployments/${marker.id}/statuses`;
  const statusRows = await inventory(statusRoute);
  const effectiveStatus = effectiveMarkerStatus(statusRows);
  assert(
    effectiveStatus &&
      positive(effectiveStatus.id) &&
      effectiveStatus.state === 'success' &&
      effectiveStatus.environment === profile.environment &&
      effectiveStatus.log_url === p.runUrl,
    'marker-latest-status'
  );
  // Newest-first first page: the marker must be on it, so every newer
  // deployment is visible without paging the environment's whole history.
  const environmentRoute = `${base}/deployments?environment=${profile.environment}&per_page=100&page=1`;
  const environmentPage = async () => {
    const { data } = await get(environmentRoute);
    assert(Array.isArray(data) && data.length <= 100, 'environment-shape');
    return data;
  };
  const environmentDeployments = await environmentPage();
  assert(
    !markerSuperseded({ marker, environmentDeployments }),
    'marker-superseded'
  );
  setPhase(PHASE.CONTRACTS);
  const sourceContracts = new Map();
  async function checkContracts(producerHead) {
    if (sourceContracts.has(producerHead))
      return sourceContracts.get(producerHead);
    let producerPlanner;
    for (const [path, allowed] of profile.contracts) {
      const unique = new Set();
      for (const revision of new Set([source, producerHead])) {
        const { data: entry } = await get(
          `${base}/contents/${path}?ref=${revision}`
        );
        assert(
          entry.type === 'file' &&
            entry.path === path &&
            allowed.includes(entry.sha),
          'unknown-producer-contract'
        );
        unique.add(entry.sha);
        if (path === profile.callerWorkflowPath && revision === producerHead)
          producerPlanner = entry.sha;
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
    sourceContracts.set(producerHead, producerPlanner);
    return producerPlanner;
  }
  const producerPlanner = await checkContracts(callerRun.head_sha);
  setPhase(PHASE.JOBS);
  const callerJobs = await inventory(
    `${base}/actions/runs/${p.runId}/attempts/${p.runAttempt}/jobs`,
    'jobs'
  );
  const callerJob = callerJobs.find(
    (row) => row.name === profile.callerDeployJobName
  );
  checkDeploymentJob(callerJob, callerRun, profile);
  assert(
    callerRun.run_attempt === Number(p.runAttempt) &&
      (!env.PLANNER_RUN_ID || String(callerRun.id) === env.PLANNER_RUN_ID) &&
      (!env.PLANNER_RUN_ATTEMPT ||
        String(callerRun.run_attempt) === env.PLANNER_RUN_ATTEMPT) &&
      callerJobs.every(
        (row) =>
          row.run_id === callerRun.id &&
          row.run_attempt === callerRun.run_attempt &&
          row.head_sha === callerRun.head_sha
      ),
    'planner-attempt-binding'
  );
  const classification = classifyPlannerJobs(callerJobs, callerRun.conclusion, {
    historicalPlanner:
      LEGACY_VERCEL_PLANNER_CONTRACTS.includes(producerPlanner),
  });
  assert(classification.ok, `planner-jobs-${classification.reason}`);
  if (callerRun.conclusion === 'failure') {
    const recovery = checkProductionMigrationRecovery({
      allow: allowFailure,
      eventName: env.EVENT_NAME,
      refName: env.CURRENT_REF_NAME,
      expectedSha: env.EXPECTED_SHA,
      targetSha: source,
      planner: callerRun,
      jobPages: [{ total_count: callerJobs.length, jobs: callerJobs }],
    });
    assert(recovery.allowed, 'canonical-recovery-required');
  }
  setPhase(PHASE.RECHECK);
  const rereadJobs = await inventory(
    `${base}/actions/runs/${p.runId}/attempts/${p.runAttempt}/jobs`,
    'jobs'
  );
  assert(snapshot(rereadJobs) === snapshot(callerJobs), 'planner-jobs-changed');
  const newest = await inventory(
    `${base}/deployments?environment=${profile.environment}&sha=${source}`
  );
  newest.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
  );
  const eligible = newest.filter((candidate) => {
    try {
      checkMarkerPayload(candidate, payload(candidate), profile, source);
      return true;
    } catch {
      return false;
    }
  });
  assert(eligible[0]?.id === marker.id, 'marker-selection-changed');
  const { data: rereadMarker } = await get(`${base}/deployments/${marker.id}`);
  checkMarkerPayload(rereadMarker, payload(rereadMarker), profile, source);
  assert(snapshot(rereadMarker) === snapshot(marker), 'marker-changed');
  const rereadStatus = await inventory(statusRoute);
  assert(
    snapshot(effectiveMarkerStatus(rereadStatus)) === snapshot(effectiveStatus),
    'marker-status-changed'
  );
  const rereadEnvironment = await environmentPage();
  assert(
    !markerSuperseded({ marker, environmentDeployments: rereadEnvironment }),
    'marker-superseded'
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
  setPhase(PHASE.COMPLETE);
  if (classification.held.length > 0) {
    const summary = heldAppSummary(classification.held);
    for (const { app, jobs } of classification.held)
      for (const job of jobs)
        console.log(
          `::warning::Held app ${app}: ${job.name} ${job.conclusion}`
        );
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(
    `Production platform deployment marker caller=${callerRun.id} attempt=${callerRun.run_attempt} deployment=${marker.id}`
  );
  return {
    producer: callerRun.id,
    attempt: callerRun.run_attempt,
    deployment: marker.id,
  };
}

import { fileURLToPath } from 'node:url';

export async function runVerification(options = {}) {
  const env = options.env || process.env;
  let phase = PHASE.INPUT;
  let result;
  try {
    const proof = await verifyMarker({
      ...options,
      onPhase: (value) => {
        phase = value;
      },
    });
    result = {
      status: 'success',
      guard: 'MARKER_PROVENANCE_VERIFIED',
      phase: PHASE.COMPLETE,
      ...proof,
    };
  } catch {
    // Fixed codes only: API bodies, exceptions and credentials never enter receipts.
    result = { status: 'denied', guard: 'MARKER_PROVENANCE_DENIED', phase };
  }
  const serialized = JSON.stringify(result);
  if (env.MARKER_VERIFY_RESULT_FILE)
    writeFileSync(env.MARKER_VERIFY_RESULT_FILE, `${serialized}\n`, {
      mode: 0o600,
    });
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `marker_verified=${result.status === 'success'}\nmarker_verification_result=${serialized}\n`
    );
  console.log(`RESULT ${serialized}`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVerification()
    .then((result) => {
      if (result.status !== 'success') process.exitCode = 1;
    })
    .catch(() => {
      console.error(
        'RESULT {"status":"denied","guard":"MARKER_RESULT_WRITE_DENIED","phase":"receipt"}'
      );
      process.exitCode = 1;
    });
}
