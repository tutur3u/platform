// Publish the already restored, exact-source Tasks archive. Keep the canonical
// route and Worker settings intact and put the candidate behind a 0% override.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import {
  matchesTasksPublicationSmoke,
  runSmoke,
} from '../native-cutover/smoke-checks.mjs';
import { waitForTasksPreview } from './tasks-preview-readback.mjs';

const origin = 'https://tasks.tuturuuu.com';
const worker = 'tuturuuu-tasks';
const sourceSha = process.env.TASKS_SOURCE_SHA;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const directory = process.env.TASKS_PUBLICATION_DIR;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const sha = /^[0-9a-f]{40}$/u;
assert.match(sourceSha ?? '', sha, 'Tasks source SHA required');
assert.match(account ?? '', /^[0-9a-f]{32}$/u, 'Cloudflare account required');
assert.ok(token && directory, 'Tasks publication directory and token required');
const deploymentsPath = `/workers/scripts/${worker}/deployments`;
const receiptPath = join(directory, 'receipt.json');

async function provider(path, data, signal) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}${path}`;
  const response = await fetch(url, {
    method: data ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: data && JSON.stringify(data),
    redirect: 'error',
    signal: AbortSignal.any([
      AbortSignal.timeout(15_000),
      ...(signal ? [signal] : []),
    ]),
  });
  const body = await response.json();
  assert.ok(
    response.ok && body.success,
    `Cloudflare ${data ? 'POST' : 'GET'} ${path} failed (HTTP ${response.status}, codes ${body.errors?.map(({ code }) => code).join(',')})`
  );
  return body.result;
}

async function activeDeployment(signal) {
  const { deployments } = await provider(deploymentsPath, undefined, signal);
  const active = deployments?.[0];
  assert.match(active?.id ?? '', uuid, 'No active Tasks deployment');
  return active;
}

function save(receipt) {
  const pending = receiptPath + '.pending';
  writeFileSync(pending, JSON.stringify(receipt, null, 2) + '\n', {
    mode: 0o600,
  });
  renameSync(pending, receiptPath);
}

function request(version) {
  return (url, init = {}) => {
    const uncached = new URL(url);
    assert.equal(uncached.origin, origin);
    if (uncached.pathname === '/api/build-info') {
      uncached.searchParams.set('_tasks_release_check', randomUUID());
    }
    const headers = new Headers(init.headers);
    headers.set('cache-control', 'no-cache');
    if (version) {
      headers.set(
        'Cloudflare-Workers-Version-Overrides',
        `${worker}="${version}"`
      );
    }
    return fetch(uncached, {
      ...init,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
  };
}

async function buildSha(version) {
  const response = await request(version)(`${origin}/api/build-info`);
  assert.equal(response.status, 200, 'Tasks build-info HTTP status');
  assert.equal(response.headers.get('x-tuturuuu-runtime'), 'native');
  const { commitHash, appName } = await response.json();
  assert.equal(appName, 'tasks');
  assert.match(commitHash ?? '', sha, 'Serving Tasks source SHA');
  return commitHash;
}

async function waitForSha(expected, version) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      if ((await buildSha(version)) === expected) return;
    } catch (error) {
      console.warn(`Tasks build identity probe: ${error.message}`);
    }
    await delay(5_000);
  }
  throw new Error(`Tasks did not serve ${expected} at the expected route`);
}

async function smoke(version) {
  const report = await runSmoke(
    { origin, app: 'tasks', expectRuntime: 'native' },
    request(version)
  );
  for (const result of report.results) {
    console.log(
      `${result.name}: ${result.status ?? '-'} ${result.ttfbMs ?? '-'}ms ${result.failures.join(', ')}`
    );
  }
  return report;
}

function servesOnly(deployment, version) {
  return (
    deployment.versions?.length === 1 &&
    deployment.versions[0].version_id === version &&
    deployment.versions[0].percentage === 100
  );
}

async function setTraffic(receipt, phase, versions, expectedId) {
  if (phase === 'activate') {
    await waitForTasksPreview(
      activeDeployment,
      receipt.previousDeployment,
      expectedId
    );
    const ref = execFileSync(
      'git',
      ['ls-remote', '--exit-code', 'origin', 'refs/heads/production'],
      { encoding: 'utf8', timeout: 30_000 }
    ).trim();
    assert.equal(
      ref,
      `${sourceSha}\trefs/heads/production`,
      'Production ref advanced before Tasks activation'
    );
  } else {
    const active = await activeDeployment();
    assert.equal(active.id, expectedId, 'Active Tasks deployment changed');
  }
  return provider(deploymentsPath, {
    strategy: 'percentage',
    versions: versions.map(([version_id, percentage]) => ({
      version_id,
      percentage,
    })),
    annotations: { 'workers/message': `${receipt.operation}:${phase}` },
  });
}

async function rollback() {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  assert.equal(
    receipt.sourceSha,
    sourceSha,
    'Rollback receipt source mismatch'
  );
  assert.match(receipt.operation, /^tasks:[0-9a-f-]+$/u);
  assert.match(receipt.previousVersion, uuid);
  assert.match(receipt.previousSha, sha);
  if (!receipt.candidateVersion) return;

  const active = await activeDeployment();
  const message = active.annotations?.['workers/message'];
  if (
    message !== `${receipt.operation}:preview` &&
    message !== `${receipt.operation}:activate`
  ) {
    if (!servesOnly(active, receipt.previousVersion)) {
      console.error(
        'Tasks deployment has another owner. Check the retained receipt.'
      );
      process.exitCode = 1;
    }
    return;
  }
  assert.ok(
    active.versions.some(
      ({ version_id }) => version_id === receipt.candidateVersion
    ),
    'Active deployment does not contain the Tasks candidate'
  );
  const restored = await setTraffic(
    receipt,
    'rollback',
    [[receipt.previousVersion, 100]],
    active.id
  );
  assert.match(restored.id ?? '', uuid);
  receipt.rollbackDeployment = restored.id;
  save(receipt);
  await waitForSha(receipt.previousSha);
  console.log(`Restored Tasks version ${receipt.previousVersion}`);
}

function upload() {
  const output = join(directory, 'upload.ndjson');
  execFileSync(
    'bun',
    [
      'x',
      '--no-install',
      'wrangler',
      'versions',
      'upload',
      '--no-bundle',
      '--keep-vars',
      '-c',
      'apps/tasks/dist/server/wrangler.json',
      '--message',
      sourceSha,
    ],
    {
      env: {
        ...process.env,
        WRANGLER_OUTPUT_FILE_PATH: output,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_WRITE_LOGS: 'false',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 360_000,
    }
  );
  const uploads = readFileSync(output, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === 'version-upload');
  assert.equal(uploads.length, 1, 'Expected one uploaded version');
  const { version_id: candidate, worker_name: name } = uploads[0];
  assert.equal(name, worker);
  assert.match(candidate, uuid);
  return candidate;
}

async function publish() {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Reserve this operation before an upload. An interrupted operation is
  // reconciled from its existing receipt before a new directory is used.
  const active = await activeDeployment();
  const previousVersion = active.versions?.[0]?.version_id;
  assert.ok(
    servesOnly(active, previousVersion),
    'Tasks needs one rollback version at 100%'
  );
  assert.match(previousVersion, uuid);
  const previousSha = await buildSha();
  const receipt = {
    sourceSha,
    previousSha,
    previousVersion,
    previousDeployment: active.id,
    operation: `tasks:${randomUUID()}`,
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  const baseline = await smoke();
  receipt.baseline = baseline.results;
  save(receipt);

  if (
    previousSha === sourceSha &&
    matchesTasksPublicationSmoke(baseline, baseline)
  ) {
    assert.equal((await activeDeployment()).id, active.id);
    assert.equal(await buildSha(), sourceSha);
    console.log(`Tasks already serves qualified version ${previousVersion}`);
    return;
  }

  const candidate = process.env.TASKS_UPLOADED_VERSION ?? upload();
  assert.match(candidate, uuid);
  assert.notEqual(candidate, previousVersion);
  receipt.candidateVersion = candidate;
  save(receipt);
  const version = await provider(
    `/workers/scripts/${worker}/versions/${candidate}`
  );
  assert.equal(version.id, candidate);
  assert.equal(version.annotations?.['workers/message'], sourceSha);
  const bindings = new Set(version.resources.bindings.map(({ name }) => name));
  for (const name of [
    'ASSETS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TUTURUUU_APP_COORDINATION_SECRET',
  ]) {
    assert.ok(bindings.has(name), `Uploaded Tasks version is missing ${name}`);
  }

  const preview = await setTraffic(
    receipt,
    'preview',
    [
      [previousVersion, 100],
      [candidate, 0],
    ],
    active.id
  );
  assert.match(preview.id ?? '', uuid);
  receipt.previewDeployment = preview.id;
  save(receipt);
  await waitForSha(sourceSha, candidate);
  const preflight = await smoke(candidate);
  receipt.preview = preflight.results;
  save(receipt);
  assert.equal(await buildSha(candidate), sourceSha);
  assert.ok(
    matchesTasksPublicationSmoke(preflight, baseline),
    'Tasks version override smoke failed'
  );

  const deployed = await setTraffic(
    receipt,
    'activate',
    [[candidate, 100]],
    preview.id
  );
  assert.match(deployed.id ?? '', uuid);
  receipt.deployment = deployed.id;
  receipt.observations = [];
  save(receipt);
  await waitForSha(sourceSha);

  const start = performance.now();
  let consecutiveSlow = 0;
  for (let minute = 0; minute <= 10; minute++) {
    await delay(Math.max(0, start + minute * 60_000 - performance.now()));
    const report = await smoke();
    assert.equal((await activeDeployment()).id, deployed.id);
    assert.equal(await buildSha(), sourceSha);
    receipt.observations.push(report.results);
    save(receipt);
    assert.ok(
      matchesTasksPublicationSmoke(report, baseline),
      'Canonical Tasks smoke failed'
    );
    const slow = report.results.some(
      ({ ttfbMs }, index) =>
        ttfbMs > Math.max(2000, 3 * (baseline.results[index].ttfbMs ?? 0))
    );
    consecutiveSlow = slow ? consecutiveSlow + 1 : 0;
    assert.ok(
      consecutiveSlow < 2,
      'Tasks route latency regressed in consecutive probes'
    );
  }
  console.log(`Tasks ${sourceSha} is serving version ${candidate}`);
}

const operation = process.argv[2];
if (operation === 'publish') {
  try {
    await publish();
  } catch (error) {
    console.error(error.message);
    await rollback();
    process.exitCode = 1;
  }
} else if (operation === 'rollback') {
  await rollback();
} else {
  throw new Error('Expected publish or rollback');
}
