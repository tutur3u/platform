import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

// Runs the real Worker and DeployEnvironment Durable Object in workerd. CI
// tokens need GitHub-signed OIDC, so this harness exercises the operator API
// and seeds lane state through the Local Explorer; the OIDC lifecycle is
// covered by the unit suites with generated keys. No request here reaches
// GitHub: every token sent is rejected before a JWKS lookup.
const root = fileURLToPath(new URL('..', import.meta.url));
const operatorToken = randomUUID() + randomUUID();
const OBJECT = 'calendar:production';
const PROD = '/v1/projects/calendar/environments/production';
let worker;

// A cold start or a restart can reload the Worker on its first Durable Object
// request, which then fails; warm that path, on an object the assertions do
// not use, before asserting.
async function waitReady() {
  for (let attempt = 1; ; attempt += 1) {
    const response = await worker
      .fetch(`/v1/projects/mail/environments/staging`, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'X-Deploy-Actor': 'runtime-warmup',
        },
        signal: AbortSignal.timeout(10_000),
      })
      .catch(() => null);
    if (response?.status === 200) return;
    if (attempt === 10) throw new Error('Worker did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

before(async () => {
  worker = await startCfViteWorker({
    root,
    mode:
      process.env.DEPLOY_COORDINATOR_TEST_BUILD_OUTPUT === '1'
        ? 'build-output'
        : 'source',
    secrets: { DEPLOY_COORDINATOR_OPERATOR_TOKEN: operatorToken },
  });
  await waitReady();
});
after(async () => {
  await worker?.close();
});

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const response = await worker.fetch(path, {
    method,
    headers: {
      ...(auth
        ? {
            Authorization: `Bearer ${operatorToken}`,
            'X-Deploy-Actor': 'runtime-operator',
          }
        : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new Error(
      `${method} ${path} answered ${response.status}: ${text.slice(0, 200)}`
    );
  }
};

const sql = async (query, params = []) => {
  try {
    return await worker.durableObjectSql(
      'DeployEnvironment',
      OBJECT,
      query,
      params
    );
  } catch (caught) {
    throw new Error(`Local Explorer query failed: ${query.slice(0, 60)}`, {
      cause: caught,
    });
  }
};

test('source config keeps the Worker private and the fence on', async () => {
  const { default: config } = await import(
    pathToFileURL(`${root}/cloudflare.config.ts`).href
  );
  assert.equal(config.worker.workersDev, false);
  assert.equal(config.worker.previewUrls, false);
  assert.equal(config.worker.routes, undefined);
  assert.equal(config.worker.triggers, undefined);
  assert.equal(
    config.worker.env.DEPLOY_COORDINATOR_OPERATOR_TOKEN.type,
    'secret'
  );
  assert.equal(config.worker.env.DEPLOY_ENVIRONMENTS.type, 'durable-object');
  assert.ok(config.worker.exports.DeployEnvironment);
});

test('health and closed routes', async () => {
  const health = await worker.fetch('/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await call('/v1/projects', { auth: false })).status, 404);
  assert.equal((await call(PROD, { auth: false })).status, 404);
  for (const token of ['not-a-jwt', 'eyJhbGciOiJub25lIn0.e30.']) {
    const response = await worker.fetch(`${PROD}/deployments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: '{}',
    });
    assert.equal(response.status, 401);
  }
  const listed = await call('/v1/projects');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.projects.some((project) => project.id === 'calendar'));
});

test('lane lock, stop fence and budget survive workerd restarts', async () => {
  const empty = await call(PROD);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.lanes, []);

  // Seed a publishing deployment holding the lane, as a CI claim would.
  const now = Date.now();
  const id = randomUUID();
  const attempt = {
    jobId: id,
    attemptId: randomUUID(),
    workerId: 'runtime',
    epoch: 1,
    targetLockId: 'calendar:production:default',
    stopRevision: 0,
    leaseDeadline: new Date(now + 300_000).toISOString(),
    startedAt: now,
    leaseDeadlineMs: now + 300_000,
  };
  const deployment = {
    id,
    project: 'calendar',
    environment: 'production',
    lane: 'default',
    seq: 1,
    kind: 'deploy',
    status: 'publishing',
    sha: 'a'.repeat(40),
    ref: 'refs/heads/production',
    plan: null,
    sourceDeploymentId: null,
    artifact: null,
    url: null,
    logsUrl: null,
    actor: 'github:runtime',
    runId: 1,
    supersededBy: null,
    attempt,
    reconciled: false,
    failureReason: null,
    closedBy: null,
    idempotencyKey: 'ci:1:1:default',
    bodyDigest: 'seed',
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  await sql(
    'INSERT INTO deployments (id, lane, seq, kind, status, run_id, epoch, idempotency_key, created_at, data) VALUES (?, ?, 1, ?, ?, 1, 1, ?, ?, ?)',
    [
      id,
      'default',
      'deploy',
      'publishing',
      'ci:1:1:default',
      now,
      JSON.stringify(deployment),
    ]
  );
  await sql('INSERT INTO lanes (lane, updated_at, data) VALUES (?, ?, ?)', [
    'default',
    now,
    JSON.stringify({
      lane: 'default',
      epoch: 1,
      lockDeploymentId: id,
      held: false,
      holdReason: null,
      updatedAt: now,
    }),
  ]);

  assert.equal(
    (
      await call(PROD + '/stop', {
        method: 'POST',
        body: { reason: 'runtime' },
      })
    ).body.stopRevision,
    1
  );
  await worker.restart();
  await waitReady();
  const snapshot = await call(PROD);
  assert.equal(snapshot.body.meta.stopped, true);
  assert.equal(snapshot.body.meta.stopRevision, 1);
  assert.equal(snapshot.body.lanes[0].lockDeploymentId, id);
  assert.equal(snapshot.body.lanes[0].deployments[0].status, 'publishing');

  // A publishing deployment cannot be cancelled or rolled back to.
  assert.equal(
    (
      await call(`${PROD}/deployments/${id}/cancel`, {
        method: 'POST',
        body: {},
      })
    ).status,
    409
  );
  assert.equal(
    (await call(PROD + '/resume', { method: 'POST', body: {} })).body.stopped,
    false
  );

  // An exhausted budget stays exhausted after a restart clears isolate memory.
  const day = new Date().toISOString().slice(0, 10);
  // The Local Explorer answers only once the restarted runtime has served a
  // request, so read the environment before writing through it.
  assert.equal((await call(PROD)).status, 200);
  await sql('DELETE FROM budget');
  await sql('INSERT INTO budget (day, used) VALUES (?, 500)', [day]);
  await worker.restart();
  await waitReady();
  const rejected = await call(`${PROD}/deployments/${id}/cancel`, {
    method: 'POST',
    body: {},
  });
  assert.equal(rejected.status, 429);
  assert.equal(rejected.body.error, 'BUDGET_EXHAUSTED');
  // Stop and reads stay available to operators.
  assert.equal(
    (await call(PROD + '/stop', { method: 'POST', body: { reason: 'budget' } }))
      .status,
    200
  );
  assert.equal((await call(PROD)).status, 200);
  const [{ used }] = await sql('SELECT used FROM budget');
  assert.ok(used >= 500);
});
