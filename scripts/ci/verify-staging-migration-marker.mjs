// Exact-source staging verifier; standard-library-only trusted prerequisite control.
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
const repo = process.env.GITHUB_REPOSITORY;
const target = process.env.TARGET_SHA;
let source = target;
let sourceTree;
const token = process.env.GH_TOKEN;
const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(
  /\/$/,
  ''
);
const server = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(
  /\/$/,
  ''
);
const workflowPath = '.github/workflows/supabase-staging.yaml';
const workflowName = 'supabase-staging.yaml';
const environment = 'supabase-staging';
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
  for (let page = 1; page <= 5; page++) {
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
function payload(deployment) {
  const p =
    typeof deployment.payload === 'string'
      ? JSON.parse(deployment.payload)
      : deployment.payload;
  assert(p && typeof p === 'object' && !Array.isArray(p), 'marker-payload');
  return p;
}
async function latestMarker(repository, workflow, selectedId) {
  let rows = await inventory(
    `${base}/deployments?environment=${environment}&sha=${source}`
  );
  if (rows.length === 0 && source === target && !selectedId) {
    const { data: commit } = await get(`${base}/git/commits/${target}`);
    assert(
      commit.sha === target &&
        sha(commit.tree?.sha) &&
        Array.isArray(commit.parents) &&
        commit.parents.length > 0 &&
        commit.parents.length <= 8 &&
        commit.parents.every((p) => sha(p.sha)),
      'target-commit'
    );
    for (const parent of commit.parents) {
      const { data: candidate } = await get(
        `${base}/git/commits/${parent.sha}`
      );
      assert(
        candidate.sha === parent.sha && sha(candidate.tree?.sha),
        'parent-commit'
      );
      if (candidate.tree.sha !== commit.tree.sha) continue;
      const { data: comparison } = await get(
        `${base}/compare/refs%2Fheads%2Fmain...${parent.sha}`
      );
      if (!['identical', 'behind'].includes(comparison.status)) continue;
      const markers = await inventory(
        `${base}/deployments?environment=${environment}&sha=${parent.sha}`
      );
      if (markers.length === 0) continue;
      source = parent.sha;
      sourceTree = candidate.tree.sha;
      rows = markers;
      break;
    }
  }
  assert(rows.length > 0, 'marker-missing');
  assert(
    rows.every(
      (d) =>
        d.sha === source && d.environment === environment && stamp(d.created_at)
    ),
    'marker-inventory-source'
  );
  rows.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
  );
  for (const marker of rows) {
    if (marker.id === selectedId) return { marker };
    const p = checkMarker(marker);
    const { data: run } = await get(`${base}/actions/runs/${p.runId}`);
    if (run.event === 'workflow_dispatch') {
      checkRunIdentity(run, p, repository, workflow);
      assert(run.head_sha === source, 'manual-source');
      if (directPushContracts.has(await checkContracts(run.head_sha))) continue;
    }
    return { marker, p, run };
  }
  throw new Error('eligible-marker-missing');
}
function checkMarker(d) {
  const p = payload(d);
  assert(
    positive(d.id) &&
      d.sha === source &&
      d.ref === source &&
      d.environment === environment &&
      p.sha === source &&
      p.markerKind === 'deployment' &&
      p.workflowName === workflowName &&
      p.refName === 'main' &&
      p.ref === 'refs/heads/main',
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
  assert(
    p.runUrl === `${server}/${repo}/actions/runs/${p.runId}`,
    'marker-run-url'
  );
  return p;
}
function checkRunIdentity(run, p, repository, workflow) {
  assert(
    run.id === Number(p.runId) &&
      run.workflow_id === workflow.id &&
      run.path === workflowPath &&
      run.head_branch === 'main' &&
      sha(run.head_sha) &&
      run.repository?.id === repository.id &&
      run.repository?.full_name === repo &&
      run.head_repository?.id === repository.id &&
      run.head_repository?.full_name === repo,
    'producer-identity-contract'
  );
}
function checkRun(run, p, repository, workflow) {
  checkRunIdentity(run, p, repository, workflow);
  assert(
    run.run_attempt === Number(p.runAttempt) &&
      ['push', 'workflow_run', 'workflow_dispatch'].includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'producer-current-attempt-contract'
  );
  // Legacy wrappers bind TARGET_SHA independently; direct runs check out their own head.
  assert(
    !['push', 'workflow_dispatch'].includes(run.event) ||
      run.head_sha === source,
    'direct-source'
  );
}
// Append future push producers here as well as in the source allowlist.
const directPushContracts = new Set([
  '74fb269fcc135b0467c19d82286f1c3484c7d4f7',
]);
const contracts = [
  [
    workflowPath,
    [
      'c80066e1cd038fcda3bd6c1a79c0b12993b94b49',
      '70937258932e55cf611c2896b788da0392c09717',
      '68449e684d33ca9608e6c873563ca3092543ca6c',
      'ec2f81d196eff45ba05d2b87ad5bd1bb98b194da',
      'd880c279f37b63628706b195e5397be1cf25acd5',
      '40f1cc37c1b4c0ed2b9976019c95eb145311c77d',
      '74fb269fcc135b0467c19d82286f1c3484c7d4f7',
    ],
  ],
  [
    'scripts/ci/record-deployment-marker.ts',
    ['35eaf73931589cfe9dd62f7456a3dbe3c48c988c'],
  ],
];
// Full commit source is immutable; run and status metadata are never cached.
const sourceContracts = new Map();
async function checkContracts(producerHead) {
  if (sourceContracts.has(producerHead))
    return sourceContracts.get(producerHead);
  let producerWorkflow;
  for (const [path, allowed] of contracts) {
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
      if (path === workflowPath && revision === producerHead)
        producerWorkflow = entry.sha;
    }
    // Resolve each commit, then rehash each distinct allowlisted Git blob.
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
async function latestStatus(id, p) {
  const { data } = await get(
    `${base}/deployments/${id}/statuses?per_page=1&page=1`
  );
  assert(
    Array.isArray(data) &&
      data.length === 1 &&
      positive(data[0].id) &&
      data[0].state === 'success' &&
      data[0].environment === environment &&
      data[0].log_url === p.runUrl,
    'marker-latest-status'
  );
  return data[0];
}
let base;
async function main() {
  assert(
    typeof repo === 'string' &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) &&
      sha(target) &&
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
  base = `/repos/${repo}`;
  const { data: repository } = await get(base);
  assert(
    positive(repository.id) &&
      repository.full_name === repo &&
      repository.default_branch === 'main',
    'repository-identity'
  );
  const { data: workflow } = await get(
    `${base}/actions/workflows/${workflowName}`
  );
  assert(
    positive(workflow.id) &&
      workflow.path === workflowPath &&
      workflow.name === 'Supabase Staging Migration' &&
      workflow.state === 'active',
    'workflow-identity'
  );
  const { marker, p, run } = await latestMarker(repository, workflow);
  const runRoute = `${base}/actions/runs/${p.runId}`;
  checkRun(run, p, repository, workflow);
  const status = await latestStatus(marker.id, p);
  const producerWorkflow = await checkContracts(run.head_sha);
  assert(
    directPushContracts.has(producerWorkflow)
      ? run.event === 'push' && run.head_sha === source
      : ['workflow_run', 'workflow_dispatch'].includes(run.event),
    'producer-event-contract'
  );
  const jobs = await inventory(
    `${runRoute}/attempts/${p.runAttempt}/jobs`,
    'jobs'
  );
  assert(jobs.length === 1, 'migration-job-inventory');
  const job = jobs[0];
  assert(
    job.name === 'Migrate staging database' &&
      job.run_id === run.id &&
      job.run_attempt === run.run_attempt &&
      job.head_sha === run.head_sha &&
      job.status === 'completed' &&
      job.conclusion === 'success' &&
      stamp(job.started_at) &&
      stamp(job.completed_at) &&
      Date.parse(job.completed_at) >= Date.parse(job.started_at) &&
      Array.isArray(job.steps),
    'migration-job-contract'
  );
  const critical = [
    'Check out migration target',
    'Deploy migrations to staging',
    'Record successful staging migration marker',
  ];
  let previous = 0;
  for (const name of critical) {
    const steps = job.steps.filter((step) => step.name === name);
    assert(steps.length === 1, 'migration-step-identity');
    const step = steps[0];
    assert(
      positive(step.number) &&
        step.number > previous &&
        step.status === 'completed' &&
        step.conclusion === 'success' &&
        stamp(step.started_at) &&
        stamp(step.completed_at) &&
        Date.parse(step.completed_at) >= Date.parse(step.started_at),
      'migration-step-success'
    );
    previous = step.number;
  }
  // Sequential re-reads bound the observation; they cannot make GitHub atomic.
  const newest = await latestMarker(repository, workflow, marker.id);
  assert(
    snapshot(newest.marker) === snapshot(marker),
    'marker-selection-changed'
  );
  const { data: rereadMarker } = await get(`${base}/deployments/${marker.id}`);
  checkMarker(rereadMarker);
  assert(snapshot(rereadMarker) === snapshot(marker), 'marker-changed');
  const rereadStatus = await latestStatus(marker.id, p);
  assert(snapshot(rereadStatus) === snapshot(status), 'marker-status-changed');
  const { data: rereadRun } = await get(runRoute);
  checkRun(rereadRun, p, repository, workflow);
  assert(snapshot(rereadRun) === snapshot(run), 'producer-changed');
  if (source !== target) {
    const { data: targetCommit } = await get(`${base}/git/commits/${target}`);
    const { data: sourceCommit } = await get(`${base}/git/commits/${source}`);
    assert(
      targetCommit.sha === target &&
        sourceCommit.sha === source &&
        targetCommit.parents?.some((parent) => parent.sha === source) &&
        sha(sourceTree) &&
        targetCommit.tree?.sha === sourceTree &&
        sourceCommit.tree?.sha === sourceTree,
      'staging-source-tree'
    );
    const { data: comparison } = await get(
      `${base}/compare/refs%2Fheads%2Fmain...${source}`
    );
    assert(
      ['identical', 'behind'].includes(comparison.status),
      'staging-source-main'
    );
  }
  assert(Date.now() <= deadline, 'proof-deadline');
  const ids = `producer=${run.id} attempt=${run.run_attempt} deployment=${marker.id}`;
  // Fallback keeps the runbook prefix `source=C target=B tree=<sha>` and appends the exact-path ids.
  console.log(
    source === target
      ? `Staging source proof: source=${target} ${ids}`
      : `Staging source proof: source=${source} target=${target} tree=${sourceTree} ${ids}`
  );
  console.log(
    source === target
      ? `Cloudflare Web production deployment marker and staging migration are bound to ${target}. Proceeding with migration.`
      : `Cloudflare Web production deployment marker is bound to ${target}; staging migration is bound to its tree-equal parent ${source}. Proceeding with migration.`
  );
}
async function persistResult(result) {
  const serialized = JSON.stringify(result);
  if (process.env.STAGING_VERIFY_RESULT_FILE) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.STAGING_VERIFY_RESULT_FILE, `${serialized}\n`, {
      mode: 0o600,
    });
  }
  if (result.status === 'success') console.log(`RESULT ${serialized}`);
  else console.error(`RESULT ${serialized}`);
}
main()
  .then(() =>
    persistResult({
      status: 'success',
      guard: 'STAGING_PROVENANCE_VERIFIED',
      phase: 'complete',
    })
  )
  .catch(async () => {
    // Fixed codes only: no API bodies, exceptions, credentials or environment values.
    process.exitCode = 1;
    try {
      await persistResult({
        status: 'denied',
        guard: 'STAGING_PROVENANCE_DENIED',
        phase: 'proof',
      });
    } catch {
      console.error(
        'RESULT {"status":"denied","guard":"STAGING_RESULT_WRITE_DENIED","phase":"receipt"}'
      );
    }
  });
