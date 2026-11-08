import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readRegularFileSync } from '../safe-fs.js';
import {
  captureNormalization,
  checkNormalization,
  NORMALIZATION_KEYS,
} from './calendar-emitted-defaults.mjs';
import { sealCalendarArtifact } from './calendar-native-inventory.mjs';

export const PRIVATE_CANARY = 'calendar_ci_private_canary_never_ship_349';
const EMPTY_RESOURCES = {
  ...Object.fromEntries(
    `workflows migrations kv_namespaces send_email connect
    r2_buckets d1_databases vectorize ai_search_namespaces ai_search agent_memory
    hyperdrive services analytics_engine_datasets dispatch_namespaces
    mtls_certificates pipelines k2 secrets_store_secrets artifacts unsafe_hello_world
    flagship worker_loaders ratelimits vpc_services vpc_networks`
      .split(/\s+/)
      .map((key) => [key, []])
  ),
  triggers: {},
  exports: {},
  cloudchamber: {},
};
const empty = (v) =>
  v === undefined ||
  (Array.isArray(v)
    ? v.length === 0
    : v && typeof v === 'object' && Object.keys(v).length === 0);
const json = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    throw new Error('Invalid artifact JSON');
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function local(root, base, value) {
  assert.equal(typeof value, 'string', 'artifact path must be a string');
  assert.ok(
    value && !isAbsolute(value) && !/[\r\n]/.test(value),
    'artifact paths must be relative single-line values'
  );
  const target = resolve(base, value);
  const rel = relative(root, target);
  assert.ok(
    rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    'artifact escaped output root'
  );
  assert.equal(realpathSync(target), target, 'artifact symlinks forbidden');
  return target;
}
function deployPointer(app) {
  const native = resolve(app, '.wrangler/deploy/config.json');
  const saved = resolve(app, '.void/preview-deploy-config.json');
  const candidates = [native, saved].filter((path) => {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
  assert.equal(candidates.length, 1, 'exactly one deploy pointer is required');
  const path = candidates[0];
  assert.equal(realpathSync(path), path, 'pointer symlink forbidden');
  assert.ok(lstatSync(path).isFile(), 'pointer must be a regular file');
  // Void saves unchanged bytes; configPath retains the native directory base.
  return { path, base: dirname(native) };
}
export function validateOutput(directory, expectedSha) {
  const app = realpathSync(directory);
  const sealPath = resolve(app, 'calendar-artifact.json');
  try {
    lstatSync(sealPath);
  } catch (error) {
    if (error.code === 'ENOENT') return validateArtifact(app);
    throw error;
  }
  assert.equal(realpathSync(sealPath), sealPath, 'seal symlink forbidden');
  assert.ok(lstatSync(sealPath).isFile(), 'seal must be a regular file');
  const receipt = json(sealPath);
  verify(app, receipt, expectedSha ?? receipt.sha);
  return validateArtifact(app, receipt.normalization);
}
function validateArtifact(directory, sealedNormalization) {
  const app = realpathSync(directory),
    dist = resolve(app, 'dist');
  const { path: pointer, base: pointerBase } = deployPointer(app);
  const redirect = json(pointer);
  assert.deepEqual(Object.keys(redirect).sort(), [
    'auxiliaryWorkers',
    'configPath',
  ]);
  assert.deepEqual(
    redirect.auxiliaryWorkers,
    [],
    'auxiliary Workers forbidden'
  );
  const configPath = local(dist, pointerBase, redirect.configPath),
    config = json(configPath);
  const hasNormalization = NORMALIZATION_KEYS.some((key) =>
    Object.hasOwn(config, key)
  );
  const normalization = hasNormalization
    ? (sealedNormalization ?? captureNormalization(app, config))
    : undefined;
  assert.ok(
    hasNormalization || sealedNormalization === undefined,
    'unexpected normalization provenance'
  );
  if (normalization) checkNormalization(config, normalization);
  // Proposed source identity only. This does not establish an account or hosted Worker.
  assert.equal(config.name, 'tuturuuu-calendar');
  assert.equal(config.compatibility_date, '2026-10-19');
  assert.deepEqual(config.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.no_bundle, true, 'emitted Worker must remain prebundled');
  assert.ok(
    isDeepStrictEqual(config.rules, [
      { type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] },
    ]),
    'emitted module rules differ from the owning Cloudflare Vite emitter'
  );
  assert.equal(config.assets?.binding, 'ASSETS');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.assets.html_handling, 'none');
  const allowed = new Set([
    'name',
    'main',
    'no_bundle',
    'rules',
    'compatibility_date',
    'compatibility_flags',
    'workers_dev',
    'assets',
    'vars',
    'secrets',
    'env',
    'send_metrics',
    '$schema',
    ...NORMALIZATION_KEYS,
    ...Object.keys(EMPTY_RESOURCES),
  ]);
  for (const key of Object.keys(config))
    assert.ok(allowed.has(key), `unqualified config field: ${key}`);
  for (const [key, expected] of Object.entries(EMPTY_RESOURCES))
    if (Object.hasOwn(config, key))
      assert.deepEqual(
        config[key],
        expected,
        `resource registration forbidden: ${key}`
      );
  assert.ok(empty(config.env), 'named environments forbidden');
  assert.ok(empty(config.vars), 'emitted vars require explicit review');
  assert.deepEqual(Object.keys(config.assets).sort(), [
    'binding',
    'directory',
    'html_handling',
    'not_found_handling',
    'run_worker_first',
  ]);
  if (config.secrets !== undefined) {
    assert.deepEqual(Object.keys(config.secrets), ['required']);
    assert.ok(Array.isArray(config.secrets.required));
    assert.deepEqual(
      config.secrets.required,
      [],
      'secret registration requires observed identity and explicit review'
    );
  }
  const main = local(dist, dirname(configPath), config.main);
  assert.ok(lstatSync(main).isFile(), 'Worker main missing');
  assert.ok(
    !/(?:\.next|\.open-next|opennext|next-server)/i.test(relative(app, main)),
    'legacy Worker forbidden'
  );
  const assets = local(dist, dirname(configPath), config.assets.directory);
  assert.equal(assets, resolve(dist, 'client'), 'unexpected client directory');
  assert.ok(lstatSync(assets).isDirectory() && readdirSync(assets).length > 0);
  assert.ok(
    lstatSync(resolve(assets, 'serwist/sw.js')).isFile(),
    'exact offline URL asset missing'
  );
  return { app, configPath, config, main, assets, normalization };
}
function hashes(app) {
  sealCalendarArtifact(resolve(app, 'dist'));
  const files = {};
  function visit(path) {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'artifact symlinks forbidden');
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(resolve(path, name));
      return;
    }
    assert.ok(stat.isFile(), 'nonregular artifact forbidden');
    const name = relative(app, path).split(sep).join('/');
    assert.ok(
      !/(^|\/)(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$)|node_modules(?:\/|$)|\.next(?:\/|$)|\.open-next(?:\/|$))/.test(
        name
      ),
      'private or legacy artifact forbidden'
    );
    const bytes = readRegularFileSync(path);
    if (name.startsWith('dist/client/'))
      assert.ok(
        !bytes.includes(Buffer.from(PRIVATE_CANARY)),
        'private build value leaked to client'
      );
    files[name] = sha256(bytes);
  }
  visit(resolve(app, 'dist'));
  visit(deployPointer(app).path);
  visit(resolve(app, 'cloudflare-env.d.ts'));
  return files;
}
export function requireSourceSha(sha) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'exact source SHA required');
  return sha;
}
function createManifest(directory, sha, sealedNormalization) {
  requireSourceSha(sha);
  const { app, configPath, main, normalization } = validateArtifact(
    directory,
    sealedNormalization
  );
  return {
    schema: 1,
    ...(normalization ? { normalization } : {}),
    app: 'calendar',
    sha,
    bun: '1.4.4',
    node: '24.22.0',
    config: relative(app, configPath).split(sep).join('/'),
    main: relative(app, main).split(sep).join('/'),
    files: hashes(app),
  };
}
export function manifest(directory, sha) {
  return createManifest(directory, sha);
}
export function verify(directory, receipt, sha) {
  assert.ok(
    isDeepStrictEqual(
      createManifest(directory, sha, receipt.normalization),
      receipt
    ),
    'artifact identity or bytes changed'
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, app, expectedSha, receipt] = process.argv.slice(2);
  const sha = requireSourceSha(expectedSha);
  if (mode === 'seal')
    writeFileSync(receipt, `${JSON.stringify(manifest(app, sha), null, 2)}\n`);
  else if (mode === 'verify') verify(app, json(receipt), sha);
  else if (mode === 'config') {
    const { configPath } = validateOutput(app, sha);
    assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT required');
    appendFileSync(process.env.GITHUB_OUTPUT, `config=${configPath}\n`);
  } else throw new Error('Expected seal, verify or config');
}
