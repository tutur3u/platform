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

// The Vite-hosted runtime can reload workerd shortly after a restart, once
// the restarted Worker has served its first mutations; a request in flight
// then fails inside Vite ("fetch failed") with an HTML 500 that never reached
// the Worker. CI hit this on the read after resume (runs 45446364346 and
// 45626910191). Retry only idempotent reads, only on that non-JSON answer,
// and boundedly, so a real Worker failure still fails the test.
const read = async (path) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call(path);
    } catch (caught) {
      if (attempt === 10 || !/answered 5\d\d: /.test(String(caught?.message)))
        throw caught;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
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
  const snapshot = await read(PROD);
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
  assert.equal((await read(PROD)).status, 200);
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
  assert.equal((await read(PROD)).status, 200);
  const [{ used }] = await sql('SELECT used FROM budget');
  assert.ok(used >= 500);
});

// Every request in the CI registry test is idempotent (reads, a rejected
// registration, an upsert, stop and resume), so each tolerates the Vite
// reload that follows a restart, boundedly, like `read` does.
const settled = async (work) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (caught) {
      if (
        attempt === 10 ||
        !/answered 5\d\d: |not valid JSON|fetch failed|Local Explorer/.test(
          `${caught?.message} ${caught?.cause?.message ?? ''}`
        )
      )
        throw caught;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
};
const ciSql = (query, params = []) =>
  settled(() =>
    worker.durableObjectSql('DeployEnvironment', 'ci:main', query, params)
  );

test('CI registry: switch off by default, seeded read, stop fence across a restart', async () => {
  const CI = '/v1/ci/main';
  // The previous test restarted workerd; warm the runtime before asserting.
  await waitReady();
  // The first operator read creates the registry's tables.
  const empty = await read(CI);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.registrations, 0);
  assert.equal(empty.body.meta.stopped, false);

  // The shipped config keeps registration off: answered before the token is
  // read or the object is reached.
  const off = await settled(() =>
    call(`${CI}/registrations`, { method: 'POST', body: {}, auth: false })
  );
  assert.equal(off.status, 503);
  assert.equal(off.body.error, 'CI_OFF');
  assert.equal(
    (await settled(() => call(`${CI}/registrations`, { auth: false }))).status,
    404
  );

  const sha = 'c'.repeat(40);
  const registration = {
    sha,
    before: 'b'.repeat(40),
    base: null,
    plan: [
      {
        workflow: 'type-check.yaml',
        run: true,
        reason: 'type-check.yaml uses static tuturuuu.ts gating',
        closureKey: 'f'.repeat(32),
      },
    ],
    runId: 7,
    runAttempt: 1,
    actor: 'github:runtime',
    logsUrl: 'https://github.com/tutur3u/platform/actions/runs/7/attempts/1',
    registeredAt: Date.now(),
  };
  await ciSql(
    'INSERT OR REPLACE INTO ci_registrations (sha, registered_at, data) VALUES (?, ?, ?)',
    [sha, registration.registeredAt, JSON.stringify(registration)]
  );
  const listed = await read(`${CI}/registrations?limit=5`);
  assert.deepEqual(listed.body.registrations, [registration]);
  assert.deepEqual(
    (await read(`${CI}/registrations/${sha}`)).body,
    registration
  );
  assert.equal(
    (await read(`${CI}/registrations/${'d'.repeat(40)}`)).status,
    404
  );
  assert.equal(
    (await settled(() => call(`${CI}/registrations?limit=101`))).status,
    400
  );

  const stopped = await settled(() =>
    call(`${CI}/stop`, { method: 'POST', body: { reason: 'runtime' } })
  );
  assert.equal(stopped.body.stopRevision, 1);
  await worker.restart();
  await waitReady();
  const after = await read(CI);
  assert.equal(after.body.meta.stopped, true);
  assert.equal(after.body.registrations, 1);
  assert.equal(
    (await settled(() => call(`${CI}/resume`, { method: 'POST', body: {} })))
      .body.stopped,
    false
  );
  // The registry lives in its own object, apart from every environment.
  const [{ count }] = await ciSql(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('deployments', 'lanes', 'budget')"
  );
  assert.equal(count, 0);
});
