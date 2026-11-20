import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCfVersionId,
  runCfPrebuilt,
  teardownStagedOutput,
  VERSION_ID,
} from './cf-build-output-publisher.mjs';
import { deployConfig, readJsonc } from './gateway-deploy-config.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GATEWAY = resolve(ROOT, 'apps/gateway');
const BASE_CONFIG = resolve(ROOT, 'apps/gateway/wrangler.jsonc');
const FAMILIES = resolve(ROOT, 'apps/web/cloudflare/opennext/families.json');

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
    JSON.parse(readFileSync(FAMILIES, 'utf8')),
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
  runCfPrebuilt({
    env,
    appRoot,
    exec,
    traffic: 'activate',
    dryRun: true,
    sha,
    digest: 'rehearsal',
    workerName: merged.name,
  });
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
  let stdout = '';
  try {
    stdout = runCfPrebuilt({
      env,
      appRoot,
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
    teardownStagedOutput(appRoot);
  }
  const versionId = parseCfVersionId(stdout);
  assert.ok(
    VERSION_ID.test(versionId ?? ''),
    'cf workers versions create returned no version id'
  );
  return { versionId, mergedConfigPath: mergedPath, workerName: merged.name };
}

function main(argv) {
  const [command, settingsPath, ...rest] = argv;
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
    'usage: gateway-cf-publication.mjs rehearse|publish-version-only <settings.json>'
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
