import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_OUTPUT_PREFIX,
  parseCfVersionId,
  runCfPrebuilt,
  VERSION_ID,
} from './cf-build-output-publisher.mjs';
import {
  cfJson,
  GATEWAY_WORKER,
  RETRYABLE_EXIT,
  RetryableDeployError,
  serveGatewayVersion,
} from './gateway-cf-traffic.mjs';
import {
  deployConfig,
  gatewayFamilies,
  readJsonc,
} from './gateway-deploy-config.mjs';
import { readBack, verifyVersion } from './void-cf-publisher.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GATEWAY = resolve(ROOT, 'apps/gateway');
const BASE_CONFIG = resolve(ROOT, 'apps/gateway/wrangler.jsonc');
const FAMILIES = resolve(ROOT, 'apps/web/cloudflare/opennext/families.json');
const VINEXT_FAMILIES = resolve(
  ROOT,
  'apps/web/cloudflare/vinext/families.json'
);
/** The gateway's pinned cf; disposable copies sit outside the workspace. */
const GATEWAY_CF = join(GATEWAY, 'node_modules/.bin/cf');
const WORKER_CONFIG = `${BUILD_OUTPUT_PREFIX}workers/default/worker.config.json`;

/**
 * Build Output bindings for the merged deploy config: its text vars and its
 * service bindings, the same set an upload of that merged config sends.
 * Secrets are not declared; versions inherit them.
 */
export function mergedBindings(merged) {
  const env = {};
  for (const [name, value] of Object.entries(merged.vars ?? {})) {
    assert.equal(typeof value, 'string', `${name}: text var required`);
    env[name] = { type: 'text', value };
  }
  for (const service of merged.services ?? []) {
    assert.equal(service.environment, undefined, `${service.binding}: env`);
    assert.ok(!Object.hasOwn(env, service.binding), `${service.binding} dup`);
    env[service.binding] = {
      type: 'worker',
      worker: service.service,
      ...(service.entrypoint ? { exportName: service.entrypoint } : {}),
    };
  }
  return env;
}

/**
 * Replace the emitted Build Output bindings with the merged set. The emitted
 * config may only declare text vars the merge also sets, so the rewrite never
 * drops a binding the committed config defines.
 */
export function injectMergedBindings(appRoot, merged) {
  const path = join(appRoot, WORKER_CONFIG);
  const worker = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(worker.name, merged.name, 'Build Output names another Worker');
  const env = mergedBindings(merged);
  for (const [name, binding] of Object.entries(worker.env ?? {})) {
    assert.equal(binding.type, 'text', `${name}: unexpected emitted binding`);
    assert.ok(Object.hasOwn(env, name), `${name}: absent from merged config`);
  }
  const injected = { ...worker, env };
  writeFileSync(path, `${JSON.stringify(injected, null, 2)}\n`);
  return injected;
}

/**
 * Copy the emitted Build Output into a disposable root so binding injection
 * never alters the artifact CI archives or later steps read.
 */
function disposableOutput(appRoot, env) {
  const root = mkdtempSync(join(env.RUNNER_TEMP ?? tmpdir(), 'gateway-cf-'));
  cpSync(
    join(appRoot, '.cloudflare/output'),
    join(root, '.cloudflare/output'),
    {
      recursive: true,
    }
  );
  return root;
}

/** Write the merged Wrangler-shaped deploy config; retained for merge parity. */
export function writeMergedDeployConfig(
  settingsPath,
  outPath,
  env = process.env
) {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.equal(settings.success, true);
  assert.ok(Array.isArray(settings.result?.bindings));
  const config = deployConfig(
    readJsonc(BASE_CONFIG),
    settings.result.bindings,
    // The same OpenNext + vinext family table `write` admits.
    gatewayFamilies(
      JSON.parse(readFileSync(FAMILIES, 'utf8')),
      JSON.parse(readFileSync(VINEXT_FAMILIES, 'utf8'))
    ),
    env
  );
  writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export function assertBuildOutputPresent(appRoot = GATEWAY) {
  const tree = resolve(appRoot, '.cloudflare/output/v0');
  assert.ok(
    existsSync(tree),
    'Gateway cf Build Output missing; run vp build first'
  );
  return tree;
}

/**
 * Credential-free rehearsal: merge parity via wrangler.deploy.json shape, then
 * cf deploy --prebuilt --dry-run on the emitted Build Output.
 */
export function rehearseGatewayCfPublication({
  settingsPath,
  appRoot = GATEWAY,
  env = process.env,
  exec = execFileSync,
  sha = '0'.repeat(40),
}) {
  assert.equal(
    env.GATEWAY_PUBLICATION_REHEARSAL,
    '1',
    'Rehearsal requires GATEWAY_PUBLICATION_REHEARSAL=1'
  );
  assert.equal(
    env.CLOUDFLARE_API_TOKEN,
    undefined,
    'Rehearsal forbids deploy credentials'
  );
  const mergedPath = resolve(
    env.RUNNER_TEMP ?? '/tmp',
    'gateway-wrangler.deploy.json'
  );
  const merged = writeMergedDeployConfig(settingsPath, mergedPath, env);
  assertBuildOutputPresent(appRoot);
  const staged = disposableOutput(appRoot, env);
  try {
    injectMergedBindings(staged, merged);
    runCfPrebuilt({
      env,
      appRoot: staged,
      cfCli: GATEWAY_CF,
      exec,
      traffic: 'activate',
      dryRun: true,
      sha,
      digest: 'rehearsal',
      workerName: merged.name,
    });
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  return {
    mergedConfigPath: mergedPath,
    workerName: merged.name,
    publicationQualified: true,
    uploadMode: 'cf-prebuilt-dry-run',
  };
}

/**
 * Version-only upload (no traffic change). Live use requires
 * GATEWAY_CF_VERSION_UPLOAD_LIVE=true; Wrangler remains the default publisher
 * until merge parity is owner-verified.
 */
export function publishGatewayVersionOnly({
  settingsPath,
  appRoot = GATEWAY,
  env = process.env,
  exec = execFileSync,
  sha,
  digest,
  cfToken,
  accountId,
  readVersion = (id) =>
    readBack(() =>
      cfJson(
        ['workers', 'versions', 'get', id, '--worker-id', GATEWAY_WORKER],
        {
          env: { ...env, CLOUDFLARE_API_TOKEN: cfToken },
        }
      )
    ),
}) {
  assert.equal(env.GATEWAY_CF_VERSION_UPLOAD_LIVE, 'true');
  assert.ok(cfToken, 'Missing Cloudflare deploy credential');
  assert.ok(accountId?.trim(), 'Missing CLOUDFLARE_ACCOUNT_ID');
  const mergedPath = resolve(
    env.RUNNER_TEMP ?? '/tmp',
    'gateway-wrangler.deploy.json'
  );
  const merged = writeMergedDeployConfig(settingsPath, mergedPath, env);
  assertBuildOutputPresent(appRoot);
  const staged = disposableOutput(appRoot, env);
  let stdout = '';
  let workerConfig;
  try {
    workerConfig = injectMergedBindings(staged, merged);
    stdout = runCfPrebuilt({
      env,
      appRoot: staged,
      cfCli: GATEWAY_CF,
      exec,
      traffic: 'version-only',
      dryRun: false,
      sha,
      digest,
      workerName: merged.name,
      cfToken,
      accountId,
    });
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  const versionId = parseCfVersionId(stdout);
  assert.ok(
    VERSION_ID.test(versionId ?? ''),
    'cf workers versions create returned no version id'
  );
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const uploaded = readVersion(versionId);
  const problems = verifyVersion({
    workerConfig,
    receipt: { migrationTag: null, varOverrides: [] },
    uploaded,
    live: { bindings: settings.result.bindings },
    strict: false,
  });
  const uploadedSecrets = new Set(
    uploaded.bindings
      .filter((binding) => binding.type === 'secret_text')
      .map((binding) => binding.name)
  );
  for (const binding of settings.result.bindings)
    if (binding.type === 'secret_text' && !uploadedSecrets.has(binding.name))
      problems.push(`${binding.name}: serving secret missing from upload`);
  assert.deepEqual(problems, [], `uploaded gateway version: ${problems}`);
  return { versionId, mergedConfigPath: mergedPath, workerName: merged.name };
}

async function main(argv) {
  const [command, settingsPath, ...rest] = argv;
  if (command === 'serve') {
    const [versionId, message] = [settingsPath, ...rest];
    assert.equal(rest.length, 1, 'usage: serve <version-id> <message>');
    return serveGatewayVersion(
      { versionId, message },
      { observability: readJsonc(BASE_CONFIG).observability }
    );
  }
  assert.equal(rest.length, 0, 'unexpected arguments');
  assert.ok(settingsPath, 'settings JSON path required');
  if (command === 'rehearse')
    return rehearseGatewayCfPublication({ settingsPath });
  if (command === 'publish-version-only') {
    return publishGatewayVersionOnly({
      settingsPath,
      sha: process.env.GITHUB_SHA ?? '0'.repeat(40),
      digest: process.env.GITHUB_SHA ?? '0'.repeat(40),
      cfToken: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
  }
  throw new Error(
    'usage: gateway-cf-publication.mjs rehearse|publish-version-only <settings.json> | serve <version-id> <message>'
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error instanceof RetryableDeployError ? RETRYABLE_EXIT : 1;
  }
}
