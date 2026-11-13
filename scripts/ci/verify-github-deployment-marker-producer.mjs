// Production platform deployment marker producer verification for migration apply.
// Mirrors staging marker proof contracts without accepting deployment status alone.
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

const PRODUCTION_PLATFORM = {
  environment: 'vercel-production-platform',
  workflowName: 'vercel-production-platform.yaml',
  workflowPath: '.github/workflows/vercel-production-platform.yaml',
  workflowDisplayName: 'Vercel Platform Production Deployment',
  refName: 'production',
  ref: 'refs/heads/production',
  allowedEvents: ['workflow_call', 'workflow_dispatch'],
  contracts: [
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
  recordStep: 'Record successful Vercel deployment marker',
  deployJob: 'Deploy-Production',
};

export function profileConfig(name) {
  if (name === 'production-platform' || name === 'vercel-production-platform')
    return PRODUCTION_PLATFORM;
  return null;
}

export function checkMarkerPayload(d, p, profile, source) {
  assert(
    positive(d.id) &&
      d.sha === source &&
      d.ref === source &&
      d.environment === profile.environment &&
      p.sha === source &&
      p.markerKind === 'deployment' &&
      p.workflowName === profile.workflowName &&
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

export function checkProducerIdentity(run, p, repository, repo, workflow, profile) {
  assert(
    run.id === Number(p.runId) &&
      run.workflow_id === workflow.id &&
      run.path === profile.workflowPath &&
      run.head_branch === profile.refName &&
      sha(run.head_sha) &&
      run.repository?.id === repository.id &&
      run.repository?.full_name === repo &&
      run.head_repository?.id === repository.id &&
      run.head_repository?.full_name === repo,
    'producer-identity-contract'
  );
}

export function checkProducerAttempt(run, p, profile, source) {
  assert(
    run.run_attempt === Number(p.runAttempt) &&
      profile.allowedEvents.includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'producer-current-attempt-contract'
  );
  assert(run.head_sha === source, 'direct-source');
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
  const { data: workflow } = await get(
    `${base}/actions/workflows/${profile.workflowName}`
  );
  assert(
    positive(workflow.id) &&
      workflow.path === profile.workflowPath &&
      workflow.name === profile.workflowDisplayName &&
      workflow.state === 'active',
    'workflow-identity'
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
  let run;
  for (const candidate of rows) {
    try {
      const payloadValue = payload(candidate);
      if (payloadValue.markerKind !== 'deployment') continue;
      if (payloadValue.workflowName !== profile.workflowName) continue;
      checkMarkerPayload(candidate, payloadValue, profile, source);
      p = payloadValue;
      assert(
        p.runUrl === `${server}/${repo}/actions/runs/${p.runId}`,
        'marker-run-url'
      );
      const { data: candidateRun } = await get(
        `${base}/actions/runs/${p.runId}`
      );
      checkProducerIdentity(candidateRun, p, repository, repo, workflow, profile);
      checkProducerAttempt(candidateRun, p, profile, source);
      marker = candidate;
      run = candidateRun;
      break;
    } catch {
      continue;
    }
  }
  assert(marker && p && run, 'eligible-marker-missing');
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
        if (path === profile.workflowPath && revision === producerHead)
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
  await checkContracts(run.head_sha);
  const jobs = await inventory(
    `${base}/actions/runs/${p.runId}/attempts/${p.runAttempt}/jobs`,
    'jobs'
  );
  assert(jobs.length >= 1, 'migration-job-inventory');
  const job = jobs.find((row) => row.name === profile.deployJob);
  assert(
    job &&
      job.run_id === run.id &&
      job.run_attempt === run.run_attempt &&
      job.head_sha === run.head_sha &&
      job.status === 'completed' &&
      job.conclusion === 'success',
    'migration-job-contract'
  );
  const steps = job.steps.filter((step) => step.name === profile.recordStep);
  assert(steps.length === 1, 'migration-step-identity');
  assert(
    steps[0].status === 'completed' && steps[0].conclusion === 'success',
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
  checkProducerIdentity(rereadRun, p, repository, repo, workflow, profile);
  checkProducerAttempt(rereadRun, p, profile, source);
  assert(snapshot(rereadRun) === snapshot(run), 'producer-changed');
  assert(Date.now() <= deadline, 'proof-deadline');
  console.log(
    `Production platform deployment marker producer=${run.id} attempt=${run.run_attempt} deployment=${marker.id}`
  );
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
