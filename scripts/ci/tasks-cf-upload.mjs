// Upload the restored, sealed Tasks artifact as a Worker version with no
// traffic, through the generic Void cf publisher. Traffic, smoke checks and
// rollback stay with tasks-native-publish.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfChildEnv, VERSION_ID } from './cf-build-output-publisher.mjs';
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
    varBindings = latestBindings,
    sourceSha,
    env = process.env,
  },
  deps = {}
) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.name, TASKS_WORKER, 'sealed config names another Worker');
  const vars = { ...keptVars(config.vars, varBindings), ...config.vars };
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
  // The candidate is the id this upload returned, never a pre-existing version.
  assert.match(
    result.versionId ?? '',
    VERSION_ID,
    'upload returned no version'
  );
  assert.notEqual(
    result.versionId,
    servingVersion,
    'Tasks upload returned the serving version'
  );
  return result.versionId;
}

/**
 * Prove the candidate read back from Cloudflare is the version this run just
 * uploaded for the pinned source: the upload-returned id, carrying the exact
 * source SHA as its message, distinct from the serving version and from the
 * stale version it inherited from, and numbered directly after that source
 * (nothing else was uploaded in between). Anything else fails closed; a
 * "latest" version is never a candidate by position alone.
 */
export function assertExactCandidate(
  version,
  { uploadedId, sourceSha, servingVersion, inheritedFrom }
) {
  assert.match(uploadedId ?? '', VERSION_ID, 'No Tasks version was uploaded');
  assert.equal(
    version?.id,
    uploadedId,
    'Tasks candidate is not the version this release uploaded'
  );
  assert.notEqual(uploadedId, servingVersion, 'Tasks candidate is serving');
  assert.notEqual(
    uploadedId,
    inheritedFrom?.id,
    'Tasks candidate is the pre-existing latest version'
  );
  assert.equal(
    version.annotations?.['workers/message'],
    sourceSha,
    'Tasks candidate does not carry the pinned source SHA'
  );
  if (inheritedFrom && version.number !== inheritedFrom.number + 1)
    throw Object.assign(
      new Error('Another Tasks version was created during this release'),
      { code: 'TASKS_INTERLEAVED_UPLOAD' }
    );
}

const SOURCE_SHA = /^[0-9a-f]{40}$/u;

/**
 * The version a new upload inherits secrets from, and the source of its
 * carried-forward vars. Serving or once-deployed versions passed the strict
 * readback before any traffic and are safe sources. A latest version that
 * never reached a deployment is only tolerated as a leftover release candidate
 * (its message is a source SHA); anything else stops the release for an
 * operator. A leftover is never deleted here: Cloudflare refuses to delete the
 * latest version, and this run did not create it. It is returned as
 * `superseded` (the new upload becomes the latest version), and its vars are
 * not trusted; callers take them from the serving version. Secrets still
 * inherit from the latest version (Cloudflare's rule); the strict readback
 * proves their names, not their values.
 */
export async function inheritanceSource({
  servingVersion,
  latestVersion,
  read,
}) {
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
  console.warn(
    `Tasks version ${latest.id} is an undeployed leftover candidate; it is not this release's candidate and will be superseded by the next upload`
  );
  return { ...latest, superseded: true };
}

const LATEST_UNDELETABLE = /\b10339\b|latest version cannot be deleted/iu;

/**
 * Delete a candidate this run uploaded and rejected. `created` is the set of
 * version ids this run uploaded; any other version is refused. A just-uploaded
 * version is the Worker's latest version, which Cloudflare refuses to delete
 * (409 / 10339); that is reported as `{ deleted: false }`, not an error: the
 * next upload supersedes it and the release does not depend on removing it.
 */
export function deleteTasksVersion(
  versionId,
  { env = process.env, exec = execFileSync, created } = {}
) {
  assert.match(versionId ?? '', /^[0-9a-f-]{36}$/u, 'Tasks version id');
  assert.ok(
    created?.has(versionId),
    `Refusing to delete Tasks version ${versionId}: this release did not create it`
  );
  const [command, prefix] = cfCommand(env);
  try {
    const output = exec(
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
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      }
    );
    if (output) console.log(String(output));
    return { deleted: true };
  } catch (error) {
    // Not error.message: it echoes the command line, including the version id.
    const text = `${error?.stderr ?? ''}${error?.stdout ?? ''}`;
    if (!LATEST_UNDELETABLE.test(text)) throw error;
    console.warn(
      `Tasks version ${versionId} is the latest version and cannot be deleted; the next upload supersedes it`
    );
    return { deleted: false, reason: 'latest' };
  }
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
