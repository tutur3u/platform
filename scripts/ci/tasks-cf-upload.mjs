// Upload the restored, sealed Tasks artifact as a Worker version with no
// traffic, through the generic Void cf publisher. Traffic, smoke checks and
// rollback stay with tasks-native-publish.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfChildEnv } from './cf-build-output-publisher.mjs';
import { emitVoidCfOutput } from './void-cf-output.mjs';
import { cfCommand, publish } from './void-cf-publisher.mjs';

export const TASKS_WORKER = 'tuturuuu-tasks';
export const TASKS_CONFIG = 'apps/tasks/dist/server/wrangler.json';

/**
 * Plain-text variables of the latest uploaded version that the sealed config
 * does not set. A keep-vars version upload keeps them from that
 * same version, and versions inherit its secrets, so taking both from it
 * keeps matching variable and secret pairs together. Config values win.
 * JSON variables are refused: the Void converter types every string as text.
 */
export function keptVars(configVars, latestBindings) {
  assert.ok(Array.isArray(latestBindings), 'latest version bindings required');
  const kept = {};
  for (const binding of latestBindings) {
    if (Object.hasOwn(configVars ?? {}, binding.name)) continue;
    assert.notEqual(
      binding.type,
      'json',
      `${binding.name}: JSON variables are not carried forward`
    );
    if (binding.type === 'plain_text') kept[binding.name] = binding.text ?? '';
  }
  return kept;
}

/** Files the no_bundle default module rules would upload. */
const UPLOADED_MODULE = /\.(?:m?js|cjs|wasm|txt|html|sql|bin)$|\?module$/u;

/**
 * Tasks seals ES modules only. Every emitted module must be ESM, and every
 * server file a no_bundle upload would include must be emitted, so the cf
 * upload carries exactly the module set of the sealed artifact.
 */
export function assertEsmOnly(receipt, configPath) {
  const modules = receipt.workerConfig.manifest.modules;
  for (const [name, { type }] of Object.entries(modules))
    assert.equal(type, 'esm', `${name}: unexpected ${type} module`);
  const serverRoot = dirname(configPath);
  const visit = (directory, prefix = '') => {
    for (const name of readdirSync(directory)) {
      const rel = `${prefix}${name}`;
      const path = join(directory, name);
      if (lstatSync(path).isDirectory()) visit(path, `${rel}/`);
      else if (UPLOADED_MODULE.test(name))
        assert.ok(Object.hasOwn(modules, rel), `${rel}: module not emitted`);
    }
  };
  visit(serverRoot);
}

/**
 * Emit cf Build Output from the sealed config, upload it as a version and
 * prove its bindings against the serving version (strict: nothing serving is
 * dropped). `deps.onUploaded` receives the version id before its readback.
 * Returns the verified version id.
 */
export async function uploadTasksVersion(
  {
    configPath = TASKS_CONFIG,
    destination,
    servingVersion,
    latestBindings,
    sourceSha,
    env = process.env,
  },
  deps = {}
) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.name, TASKS_WORKER, 'sealed config names another Worker');
  const vars = { ...keptVars(config.vars, latestBindings), ...config.vars };
  assertEsmOnly(
    await emitVoidCfOutput({ configPath, destination, vars, sourceSha }),
    configPath
  );
  const result = publish(
    {
      build: destination,
      worker: TASKS_WORKER,
      message: sourceSha,
      strict: true,
    },
    {
      ...deps,
      env,
      inheritedSecrets: latestBindings
        .filter((binding) => binding.type === 'secret_text')
        .map((binding) => binding.name),
    }
  );
  assert.equal(
    result.previousVersionId,
    servingVersion,
    'Tasks serving version moved during the upload'
  );
  return result.versionId;
}

const SOURCE_SHA = /^[0-9a-f]{40}$/u;

/**
 * The version a new upload inherits secrets from, and the source of its
 * carried-forward vars. A latest version that never reached a deployment was
 * never verified, so its vars and secrets may not belong together. A leftover
 * release candidate (its message is a source SHA) is deleted; anything else
 * stops the release for an operator. Serving or once-deployed versions passed
 * the strict readback before any traffic and are safe sources.
 */
export async function inheritanceSource({
  servingVersion,
  latestVersion,
  read,
  remove,
  attempts = 3,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const latest = await latestVersion();
    if (latest.id === servingVersion) return latest;
    const { deployments } = await read(
      `/workers/scripts/${TASKS_WORKER}/deployments`
    );
    if (
      deployments?.some(({ versions }) =>
        versions?.some(({ version_id }) => version_id === latest.id)
      )
    )
      return latest;
    const version = await read(
      `/workers/scripts/${TASKS_WORKER}/versions/${latest.id}`
    );
    assert.match(
      version.annotations?.['workers/message'] ?? '',
      SOURCE_SHA,
      `Latest Tasks version ${latest.id} was never deployed and is not a release candidate; deploy or delete it before releasing`
    );
    console.warn(`Deleting unverified Tasks candidate ${latest.id}`);
    remove(latest.id);
  }
  throw new Error('Unverified Tasks release candidates remain');
}

/**
 * Delete an uploaded, never-deployed candidate whose carried-forward vars and
 * inherited secrets may come from different versions, so it can never become
 * the latest version a later release inherits from.
 */
export function deleteTasksVersion(
  versionId,
  { env = process.env, exec = execFileSync } = {}
) {
  assert.match(versionId ?? '', /^[0-9a-f-]{36}$/u, 'Tasks version id');
  const [command, prefix] = cfCommand(env);
  exec(
    command,
    [
      ...prefix,
      'workers',
      'versions',
      'delete',
      versionId,
      '--worker-id',
      TASKS_WORKER,
      '--force',
    ],
    {
      env: { ...env, CF_SEND_TELEMETRY: 'false' },
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 60000,
    }
  );
}

/**
 * Credential-free CI check: emit the sealed artifact as cf Build Output and
 * dry-run it. The child environment carries no Cloudflare credential.
 */
export async function rehearseTasksOutput(
  { configPath = TASKS_CONFIG, destination, sourceSha, env = process.env },
  { exec = execFileSync } = {}
) {
  const receipt = await emitVoidCfOutput({
    configPath,
    destination,
    sourceSha,
  });
  assert.equal(receipt.worker, TASKS_WORKER);
  assertEsmOnly(receipt, configPath);
  // cf resolves from the same pinned installation as the Build Output suppliers.
  const [command, prefix] = cfCommand(env);
  exec(
    command,
    [
      ...prefix,
      'deploy',
      '--prebuilt',
      '--mode',
      'production',
      '--dry-run',
      '--no-provision',
    ],
    {
      cwd: destination,
      env: cfChildEnv(env, { dryRun: true }),
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 120000,
    }
  );
  return {
    worker: receipt.worker,
    moduleCount: receipt.moduleCount,
    assetCount: receipt.assetCount,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, destination, sourceSha] = process.argv.slice(2);
  try {
    assert.equal(
      command,
      'rehearse',
      'usage: tasks-cf-upload.mjs rehearse <out> <sha>'
    );
    assert.match(
      sourceSha ?? '',
      /^[0-9a-f]{40}$/u,
      'exact source SHA required'
    );
    console.log(
      JSON.stringify(await rehearseTasksOutput({ destination, sourceSha }))
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
