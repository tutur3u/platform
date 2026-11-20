import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCfVersionId, VERSION_ID } from './cf-build-output-publisher.mjs';

// Publishes cf Build Output from `void-cf-output.mjs` as a version with no
// traffic, proves the uploaded bindings, then moves traffic only when the
// serving version is still the one captured. Every step uses the cf CLI.

const BINDING_TYPES = {
  text: 'plain_text',
  json: 'json',
  secret: 'secret_text',
  assets: 'assets',
  worker: 'service',
  r2: 'r2_bucket',
  kv: 'kv_namespace',
  d1: 'd1',
  images: 'images',
  'analytics-engine-dataset': 'analytics_engine',
  'durable-object': 'durable_object_namespace',
  'unsafe:durable_object_namespace': 'durable_object_namespace',
};

function cf(args, { cwd, exec = execFileSync, env = process.env } = {}) {
  const bin = env.CF_BIN;
  return exec(bin ?? 'bun', bin ? args : ['x', '--no-install', 'cf', ...args], {
    cwd,
    env: { ...env, CF_SEND_TELEMETRY: 'false' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 600000,
  });
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The single version serving 100% of traffic, or an error. */
export function servingVersion(deployments) {
  const latest = [...(deployments.deployments ?? [])].sort((a, b) =>
    String(b.created_on).localeCompare(String(a.created_on))
  )[0];
  assert.ok(latest, 'Worker has no deployment');
  assert.equal(latest.versions.length, 1, 'traffic is split across versions');
  assert.equal(latest.versions[0].percentage, 100);
  return latest.versions[0].version_id;
}

const pause = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * A just-created version can read back as 404 until the Workers API
 * propagates it; retry a bounded number of times before failing.
 */
export function readBack(read, { sleep = pause, attempts = 8 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return read();
    } catch (error) {
      const text = `${error?.stderr ?? ''}${error?.stdout ?? ''}${error?.message ?? ''}`;
      if (attempt >= attempts || !/404|10007/u.test(text)) throw error;
      sleep(attempt * 5000);
    }
  }
}

export function capture(worker, deps = {}) {
  const deployments = JSON.parse(
    cf(['workers', 'deployments', 'list', '--worker', worker], deps)
  );
  const versionId = servingVersion(deployments);
  const version = JSON.parse(
    cf(['workers', 'versions', 'get', versionId, '--worker-id', worker], deps)
  );
  return { worker, versionId, version };
}

/** Check one uploaded binding against the emitted Build Output binding. */
function bindingMatches(name, expected, actual) {
  const problems = [];
  const want = BINDING_TYPES[expected.type];
  if (!want) return [`${name}: unsupported emitted type ${expected.type}`];
  if (actual?.type !== want)
    return [`${name}: expected ${want}, got ${actual?.type ?? 'missing'}`];
  const same = (field, value) => {
    if ((actual[field] ?? undefined) !== (value ?? undefined))
      problems.push(`${name}: ${field} differs`);
  };
  if (expected.type === 'text') same('text', expected.value);
  if (expected.type === 'worker') {
    same('service', expected.worker);
    same('entrypoint', expected.exportName);
  }
  if (expected.type === 'r2') same('bucket_name', expected.name);
  if (expected.type === 'kv') same('namespace_id', expected.id);
  if (expected.type === 'd1') same('id', expected.id);
  if (expected.type === 'analytics-engine-dataset')
    same('dataset', expected.name);
  if (expected.type === 'unsafe:durable_object_namespace') {
    same('class_name', expected.class_name);
    same('script_name', undefined);
  }
  if (expected.type === 'durable-object') {
    same('class_name', expected.exportName);
    same('script_name', expected.worker);
  }
  return problems;
}

/**
 * Prove the uploaded version: every emitted binding exists with its emitted
 * shape, nothing extra appeared, Durable Object namespaces and the migration
 * tag are the serving version's, and `strict` additionally requires the
 * serving version's bindings except the declared variable overrides.
 */
export function verifyVersion({
  workerConfig,
  receipt,
  uploaded,
  live,
  strict,
}) {
  const problems = [];
  const byName = new Map(uploaded.bindings.map((b) => [b.name, b]));
  const liveByName = new Map(live.bindings.map((b) => [b.name, b]));
  for (const [name, expected] of Object.entries(workerConfig.env))
    problems.push(...bindingMatches(name, expected, byName.get(name)));
  for (const [name, binding] of byName) {
    if (Object.hasOwn(workerConfig.env, name)) continue;
    // Versions inherit every secret already bound on the Worker.
    const inherited =
      binding.type === 'secret_text' &&
      liveByName.get(name)?.type === 'secret_text';
    if (!inherited) problems.push(`${name}: unexpected uploaded binding`);
  }
  for (const [name, binding] of byName) {
    if (binding.type !== 'durable_object_namespace' || binding.script_name)
      continue;
    const before = liveByName.get(name);
    if (
      typeof binding.namespace_id !== 'string' ||
      !binding.namespace_id ||
      before?.namespace_id !== binding.namespace_id
    )
      problems.push(`${name}: Durable Object namespace changed`);
  }
  const settings = [
    ['compatibility_date', workerConfig.compatibilityDate],
    [
      'compatibility_flags',
      [...(workerConfig.compatibilityFlags ?? [])].sort(),
    ],
    ['placement', workerConfig.placement],
    ['main_module', workerConfig.manifest?.mainModule],
  ];
  for (const [field, expected] of settings) {
    const actual =
      field === 'compatibility_flags'
        ? [...(uploaded.compatibility_flags ?? [])].sort()
        : uploaded[field];
    if (
      expected !== undefined &&
      JSON.stringify(actual ?? null) !== JSON.stringify(expected)
    )
      problems.push(`${field} differs from the emitted output`);
  }
  if ((live.migration_tag ?? null) !== (receipt.migrationTag ?? null))
    problems.push('migration tag differs from the serving version');
  if ((uploaded.migration_tag ?? null) !== (live.migration_tag ?? null))
    problems.push('uploaded migration tag differs from the serving version');
  if (strict) {
    const overrides = new Set(receipt.varOverrides);
    const shape = ({ namespace_id, environment, ...rest }) =>
      JSON.stringify(rest);
    for (const [name, before] of liveByName) {
      if (overrides.has(name)) continue;
      const after = byName.get(name);
      if (!after || shape(after) !== shape(before))
        problems.push(`${name}: differs from the serving version`);
    }
    for (const name of byName.keys())
      if (!liveByName.has(name) && !overrides.has(name))
        problems.push(`${name}: absent from the serving version`);
  }
  return problems;
}

export function publish(
  { build, worker, message, strict = false, secretsFile },
  deps = {}
) {
  const receipt = readJson(join(build, 'void-cf-receipt.json'));
  assert.equal(receipt.worker, worker, 'Build Output names another Worker');
  const workerConfig = readJson(
    join(build, '.cloudflare/output/v0/workers/default/worker.config.json')
  );
  const live = capture(worker, deps);
  // Versioned uploads cannot apply tag migrations; refuse before uploading.
  assert.equal(
    live.version.migration_tag ?? null,
    receipt.migrationTag ?? null,
    'pending Durable Object migration: versioned publication cannot apply it'
  );
  const output = cf(
    [
      'workers',
      'versions',
      'create',
      '--prebuilt',
      '--mode',
      'production',
      '--message',
      message,
      ...(secretsFile ? ['--secrets-file', resolve(secretsFile)] : []),
    ],
    { ...deps, cwd: build }
  );
  const versionId = parseCfVersionId(output);
  assert.ok(VERSION_ID.test(versionId ?? ''), 'cf returned no version id');
  const uploaded = JSON.parse(
    readBack(
      () =>
        cf(
          ['workers', 'versions', 'get', versionId, '--worker-id', worker],
          deps
        ),
      deps
    )
  );
  const problems = verifyVersion({
    workerConfig,
    receipt,
    uploaded,
    live: live.version,
    strict,
  });
  assert.deepEqual(problems, [], `uploaded version rejected: ${problems}`);
  return { worker, versionId, previousVersionId: live.versionId, strict };
}

export function assign({ worker, version, expectCurrent }, deps = {}) {
  assert.ok(VERSION_ID.test(version), 'invalid version id');
  const before = servingVersion(
    JSON.parse(cf(['workers', 'deployments', 'list', '--worker', worker], deps))
  );
  if (expectCurrent)
    assert.equal(before, expectCurrent, 'serving version moved since capture');
  cf(
    [
      'workers',
      'deployments',
      'create',
      '--worker',
      worker,
      '--strategy',
      'percentage',
      '--versions',
      JSON.stringify([{ version_id: version, percentage: 100 }]),
    ],
    deps
  );
  const { sleep = pause, attempts = 8 } = deps;
  let after;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    after = servingVersion(
      JSON.parse(
        cf(['workers', 'deployments', 'list', '--worker', worker], deps)
      )
    );
    if (after === version || attempt === attempts) break;
    sleep(attempt * 5000);
  }
  assert.equal(after, version, 'deployment did not take effect');
  return { worker, previousVersionId: before, versionId: after };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/u, '');
    if (key === 'strict') flags.strict = true;
    else {
      assert.ok(argv[i + 1] !== undefined, `missing value for --${key}`);
      flags[key.replace(/-(\w)/gu, (_, c) => c.toUpperCase())] = argv[++i];
    }
  }
  return flags;
}

function main([command, ...argv]) {
  const flags = parseFlags(argv);
  if (command === 'capture') {
    const result = capture(flags.worker);
    if (flags.out) writeFileSync(flags.out, `${JSON.stringify(result)}\n`);
    return { worker: result.worker, versionId: result.versionId };
  }
  if (command === 'publish') return publish(flags);
  if (command === 'assign') return assign(flags);
  throw new Error(
    'usage: void-cf-publisher.mjs capture|publish|assign --worker <name> ...'
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
