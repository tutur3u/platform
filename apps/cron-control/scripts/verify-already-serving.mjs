import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { currentDeployment } from '../../../scripts/ci/cf-worker-current-deployment.mjs';
import { readBuildOutputConfig } from '../../../scripts/ci/cf-worker-parity.mjs';
import {
  captureAfter,
  compareTransition,
  settingsPlan,
} from '../../../scripts/ci/cf-worker-settings.mjs';
import { createClient } from '../../../scripts/ci/deploy-coordinator-client.mjs';

const REPOSITORY = 'tutur3u/platform';
const WORKFLOW = '.github/workflows/cron-control-cloudflare.yaml';
const WORKER = 'tuturuuu-cron-control';
const RELAY = 'CRON_CONTROL_RELAY_TOKEN';
const ENTRY = 'index.js';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_MODULE_BYTES = 1024 * 1024;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parseProof(input, sha, accountId, plan) {
  const proof = JSON.parse(input);
  assert.ok(
    /^[0-9a-f]{40}$/u.test(sha) && proof?.sha === sha,
    'Cron Control approval belongs to a different source SHA'
  );
  assert.ok(
    /^[0-9a-f]{32}$/u.test(accountId) &&
      proof.accountId === accountId &&
      accountId === plan.target.accountId &&
      proof.worker === WORKER &&
      plan.target.name === WORKER &&
      UUID.test(proof.deploymentId) &&
      UUID.test(proof.versionId) &&
      SHA256.test(proof.settingsHash) &&
      SHA256.test(proof.moduleSha256) &&
      SHA256.test(proof.artifactDigest) &&
      SHA256.test(proof.secretNamesSha256) &&
      positiveId(proof.runId) &&
      positiveId(proof.artifactId) &&
      (/^[0-9a-f]{32}$/u.test(proof.ledgerNamespaceId) ||
        UUID.test(proof.ledgerNamespaceId)) &&
      Object.hasOwn(proof, 'migrationTag') &&
      (proof.migrationTag === null ||
        /^[\w.-]{1,128}$/u.test(proof.migrationTag)),
    'invalid Cron Control serving approval'
  );
  return proof;
}

function matchesSecretInventory(names, proof) {
  return (
    Array.isArray(names) &&
    names.length <= 100 &&
    names.every((name) => typeof name === 'string') &&
    names.includes(RELAY) &&
    new Set(names).size === names.length &&
    digest(JSON.stringify([...names].sort())) === proof.secretNamesSha256
  );
}

function requireSnapshot(snapshot, proof, plan) {
  const [deployment] = snapshot.rollback ?? [];
  const [version] = deployment?.versions ?? [];
  assert.ok(
    snapshot.accountId === proof.accountId &&
      snapshot.worker === WORKER &&
      snapshot.rollback?.length === 1 &&
      deployment.id === proof.deploymentId &&
      deployment.versions.length === 1 &&
      version.version_id === proof.versionId &&
      version.percentage === 100,
    'approved Cron Control deployment is no longer serving alone'
  );
  assert.ok(
    snapshot.stage === 'target' &&
      snapshot.transition === plan.transition?.decision &&
      snapshot.settingsHash === proof.settingsHash,
    'approved Cron Control target settings differ'
  );
  assert.ok(
    matchesSecretInventory(snapshot.secrets, proof),
    'approved Cron Control secret inventory differs'
  );
}

function readQualifiedModule(appDir, proof) {
  const { worker } = readBuildOutputConfig(appDir);
  const directory = join(
    appDir,
    '.cloudflare/output/v0/workers/default/bundle'
  );
  assert.ok(
    worker.manifest.mainModule === ENTRY &&
      isDeepStrictEqual(worker.manifest.modules, {
        [ENTRY]: { type: 'esm' },
      }) &&
      lstatSync(directory).isDirectory() &&
      isDeepStrictEqual(readdirSync(directory), [ENTRY]),
    'qualified Cron Control module inventory differs'
  );
  const file = join(directory, ENTRY);
  const stat = lstatSync(file);
  assert.ok(
    stat.isFile() && stat.size > 0 && stat.size <= MAX_MODULE_BYTES,
    'qualified Cron Control module bytes unavailable'
  );
  const bytes = readFileSync(file);
  assert.ok(
    digest(bytes) === proof.moduleSha256,
    'qualified Cron Control module differs from the approved digest'
  );
  return bytes;
}

async function readJson(fetchImpl, url, label, headers = {}) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: { ...headers, 'cache-control': 'no-cache' },
  });
  assert.ok(response.ok && response.body, `${label} HTTP ${response.status}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    assert.ok(length <= MAX_MODULE_BYTES * 2, `${label} response too large`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function requireProducer(proof, fetchImpl) {
  // Public immutable metadata needs no token or new workflow permission.
  const api = `https://api.github.com/repos/${REPOSITORY}/actions`;
  const [run, artifact] = await Promise.all([
    readJson(fetchImpl, `${api}/runs/${proof.runId}`, 'Cron Control producer'),
    readJson(
      fetchImpl,
      `${api}/artifacts/${proof.artifactId}`,
      'Cron Control artifact'
    ),
  ]);
  assert.ok(
    run.id === proof.runId &&
      run.path === WORKFLOW &&
      run.repository?.full_name === REPOSITORY &&
      run.head_repository?.full_name === REPOSITORY &&
      positiveId(run.repository.id) &&
      run.repository.id === run.head_repository.id &&
      run.head_branch === 'main' &&
      run.head_sha === proof.sha &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'Cron Control artifact producer is not the approved main run'
  );
  assert.ok(
    artifact.id === proof.artifactId &&
      artifact.expired === false &&
      artifact.name === `cron-control-worker-${proof.sha}` &&
      artifact.digest === `sha256:${proof.artifactDigest}` &&
      artifact.workflow_run?.id === proof.runId &&
      artifact.workflow_run.head_sha === proof.sha &&
      artifact.workflow_run.head_branch === 'main' &&
      artifact.workflow_run.repository_id === run.repository.id &&
      artifact.workflow_run.head_repository_id === run.head_repository.id,
    'Cron Control artifact metadata differs from the approval'
  );
}

async function readWorker({ accountId, token, fetchImpl }, suffix) {
  assert.ok(token, 'CLOUDFLARE_API_TOKEN is required');
  const path = `/accounts/${accountId}/workers/${suffix}`;
  const response = await readJson(
    fetchImpl,
    `https://api.cloudflare.com/client/v4${path}`,
    'Worker read',
    { authorization: `Bearer ${token}` }
  );
  assert.ok(response?.success === true, 'Worker read failed');
  return response;
}

async function readVersion(credentials, version) {
  const response = await readWorker(
    credentials,
    `workers/${WORKER}/versions/${version}`
  );
  assert.ok(
    response?.success === true && typeof response.result?.id === 'string',
    'Worker version response unavailable'
  );
  return response.result;
}

function requireServingModule(serving, bytes, proof) {
  const modules = serving.modules;
  assert.ok(
    serving.id === proof.versionId &&
      serving.main_module === ENTRY &&
      Array.isArray(modules) &&
      modules.length === 1 &&
      modules[0]?.name === ENTRY &&
      modules[0].content_type === 'application/javascript+module',
    'serving Cron Control version or module inventory differs'
  );
  assert.ok(
    modules[0].content_base64 === bytes.toString('base64'),
    'serving Cron Control module bytes differ or are unavailable'
  );
  assert.ok(
    Array.isArray(serving.bindings),
    'Worker version bindings unavailable'
  );
  const names = serving.bindings
    .filter(({ type }) => type === 'secret_text')
    .map(({ name }) => name);
  assert.ok(
    matchesSecretInventory(names, proof),
    'serving Cron Control version secret inventory differs'
  );
  const ledgers = serving.bindings.filter(({ name }) => name === 'CRON_LEDGER');
  assert.ok(
    ledgers.length === 1 &&
      ledgers[0].type === 'durable_object_namespace' &&
      ledgers[0].class_name === 'CronLedger' &&
      ledgers[0].namespace_id === proof.ledgerNamespaceId &&
      (serving.migration_tag ?? null) === proof.migrationTag &&
      (serving.exports === undefined ||
        serving.exports?.CronLedger?.storage === 'sqlite'),
    'serving CronLedger namespace or migration identity differs'
  );
}

export async function renewServingLease(
  env,
  {
    fetchImpl = fetch,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  const client = createClient({
    env: { ...env, DC_PROJECT: 'cron-control', DC_ENVIRONMENT: 'production' },
    fetch: (url, init) => fetchImpl(url, { ...init, redirect: 'error' }),
    sleep,
  });
  const { stateFile, origin, workerId } = client.config;
  const fenced = () => existsSync(`${stateFile}.fenced`);
  assert.ok(
    env.CRON_COORDINATOR_CHECK === 'success' &&
      UUID.test(env.CRON_COORDINATOR_DEPLOYMENT_ID) &&
      !fenced() &&
      existsSync(stateFile),
    'Cron Control serving approval requires an unfenced coordinator lease'
  );
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const { grant } = state;
  assert.ok(
    state.deploymentId === env.CRON_COORDINATOR_DEPLOYMENT_ID &&
      origin.startsWith('https://') &&
      new URL(origin).origin === origin &&
      state.base === origin &&
      grant?.jobId === state.deploymentId &&
      grant.workerId === workerId &&
      typeof grant.attemptId === 'string' &&
      UUID.test(grant.attemptId) &&
      positiveId(grant.epoch),
    'Cron Control coordinator lease identity differs'
  );
  const response = await client.post(
    `/deployments/${state.deploymentId}/heartbeat`,
    { grant: { attemptId: grant.attemptId, epoch: grant.epoch } }
  );
  const renewed = response.body;
  assert.ok(
    response.ok &&
      renewed?.jobId === state.deploymentId &&
      renewed.attemptId === grant.attemptId &&
      renewed.epoch === grant.epoch &&
      renewed.workerId === workerId,
    'Cron Control coordinator did not renew the exact lease'
  );
  const deadline = Date.parse(renewed.leaseDeadline);
  const verifyLease = () => {
    assert.ok(
      deadline > now() && !fenced(),
      'Cron Control coordinator lease expired or was fenced'
    );
  };
  verifyLease();
  return verifyLease;
}

async function confirmSnapshot(snapshot, proof, plan, credentials) {
  requireSnapshot(snapshot, proof, plan);
  const latest = await readVersion(credentials, 'latest');
  assert.ok(
    latest.id === proof.versionId,
    'latest Cron Control version differs'
  );
}

export async function alreadyServing(
  { input, sha, before, appDir, plan, fetchImpl = fetch, ...auth },
  { capture = captureAfter, checkLease } = {}
) {
  if (!input) return false;
  const proof = parseProof(input, sha, auth.accountId, plan);
  requireSnapshot(before, proof, plan);
  const verifyLease = await checkLease();
  const bytes = readQualifiedModule(appDir, proof);
  await requireProducer(proof, fetchImpl);
  const credentials = { ...auth, fetchImpl };
  const serving = await readVersion(
    credentials,
    `${proof.versionId}?include=modules`
  );
  requireServingModule(serving, bytes, proof);
  const fresh = await capture({ plan, ...credentials });
  compareTransition(plan, before, fresh);
  await confirmSnapshot(fresh, proof, plan, credentials);
  verifyLease();
  return true;
}

export async function confirmStillServing(
  { input, proofDigest, sha, before, after, plan, fetchImpl = fetch, ...auth },
  { capture = captureAfter, checkLease }
) {
  const proof = parseProof(input, sha, auth.accountId, plan);
  assert.ok(
    digest(input) === proofDigest,
    'Cron Control approval changed during verification'
  );
  requireSnapshot(before, proof, plan);
  compareTransition(plan, before, after);
  requireSnapshot(after, proof, plan);
  const verifyLease = await checkLease();
  const credentials = { ...auth, fetchImpl };
  const fresh = await capture({ plan, ...credentials });
  compareTransition(plan, before, fresh);
  await confirmSnapshot(fresh, proof, plan, credentials);
  const { deployments } = await currentDeployment(
    (path) => readWorker(credentials, path),
    `scripts/${WORKER}/deployments`
  );
  requireSnapshot({ ...fresh, rollback: deployments }, proof, plan);
  verifyLease();
}

function decodeProof(secret) {
  const decoded = Buffer.from(secret, 'base64');
  assert.ok(
    decoded.length > 0 && decoded.toString('base64') === secret,
    'Cron Control serving approval must be canonical base64'
  );
  return decoded.toString('utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [phase, appDir, baseline, beforePath, afterPath] =
      process.argv.slice(2);
    assert.ok(
      phase === 'check' || phase === 'confirm',
      'invalid serving proof phase'
    );
    const secret = process.env.CRON_CONTROL_SERVING_PROOF;
    if (phase === 'check' && !secret) {
      writeFileSync(process.env.GITHUB_OUTPUT, 'reuse=false\n', { flag: 'a' });
    } else {
      assert.ok(
        process.env.GITHUB_REPOSITORY === REPOSITORY &&
          process.env.GITHUB_REF === 'refs/heads/production',
        'Cron Control serving approval requires the platform production ref'
      );
      assert.ok(
        process.env.CRON_COORDINATOR_PUBLISH !== 'false',
        'Cron Control serving approval is held by the coordinator'
      );
      const input = decodeProof(secret ?? '');
      const proofOptions = {
        input,
        sha: process.env.GITHUB_SHA,
        appDir,
        plan: settingsPlan(JSON.parse(readFileSync(baseline, 'utf8'))),
        before: JSON.parse(readFileSync(beforePath, 'utf8')),
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        token: process.env.CLOUDFLARE_API_TOKEN,
      };
      const deps = { checkLease: () => renewServingLease(process.env) };
      if (phase === 'check') {
        await alreadyServing(proofOptions, deps);
        writeFileSync(
          process.env.GITHUB_OUTPUT,
          `reuse=true\nproof-digest=${digest(input)}\n`,
          { flag: 'a' }
        );
        console.log(
          'Qualified Cron Control artifact already serves as the approved version.'
        );
      } else {
        const after = JSON.parse(readFileSync(afterPath, 'utf8'));
        await confirmStillServing(
          {
            ...proofOptions,
            after,
            proofDigest: process.env.CRON_CONTROL_PROOF_DIGEST,
          },
          deps
        );
      }
    }
  } catch (error) {
    const reason =
      error instanceof assert.AssertionError
        ? error.message
        : 'approval or readback unavailable';
    console.error(`Cron Control serving proof failed: ${reason}`);
    process.exitCode = 1;
  }
}
